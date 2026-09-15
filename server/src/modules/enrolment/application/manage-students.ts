/**
 * M5 Student Records, the minimum an attendance roster needs.
 *
 * A student record never duplicates identity: the person is M1's, and this adds
 * the enrolment number, the program and the academic status the college keys
 * history against. Cohort membership and course enrolment are both
 * validity-bounded, so the record of who was taught what in week three survives
 * a withdrawal in week ten.
 *
 * See docs/blueprint/modules/m5-m6-attendance.md.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { PersonRepository } from '../../identity/application/ports.ts';
import type { OfferingRepository, SectionRepository } from '../../teaching/application/ports.ts';
import type {
  EnrolmentRepository, MembershipRecord, MembershipRepository, RosterEntry, StudentFilter,
  StudentRecord, StudentRepository, StudentStatus,
} from './ports.ts';

export interface EnrolmentActor {
  tenantId: string;
  personId: string;
}

export interface EnrolmentDeps {
  uow: UnitOfWork;
  students: StudentRepository;
  memberships: MembershipRepository;
  enrolments: EnrolmentRepository;
  persons: PersonRepository;
  sections: SectionRepository;
  offerings: OfferingRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/** A calendar date for today, in UTC, matching how every date here is stored. */
const todayIso = (clock: Clock) => clock.now().toISOString().slice(0, 10);

/**
 * Every use case here runs through this.
 *
 * A trigger or a check constraint that refuses a write raises a message worth
 * reading; without this it escapes the transaction as an exception and reaches
 * the user as "something went wrong", which is the least useful thing the system
 * could say.
 */
async function attempt<T>(
  run: () => Promise<Result<T>>, fallback: string,
): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message || fallback));
    throw e;
  }
}

/**
 * Admits a student: one person and one student record, in one transaction.
 *
 * No account and no invitation. A student record does not need a login on the
 * day it is created, and a registrar admitting four hundred students should not
 * be minting four hundred credentials to do it.
 */
export async function admitStudent(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: {
    // AD-85: a student's sign-in code goes to their email, so it is mandatory.
    fullName: string; email: string; phone?: string | null; enrolmentNumber: string;
    programId: string; admittedOn: string;
  },
): Promise<Result<{ id: string; personId: string }>> {
  const studentId = deps.ids.next();
  const enrolmentNumber = input.enrolmentNumber.trim().toUpperCase();

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const person = await deps.persons.create(tx, {
        id: deps.ids.next(),
        tenantId: actor.tenantId,
        fullName: input.fullName.trim(),
        // Normalised at the boundary, as M1 requires: the column checks it.
        primaryEmail: input.email.trim().toLowerCase(),
        // AD-82: a sign-in code can go here. Kept as typed; sign-in compares
        // its last ten digits.
        primaryPhone: input.phone?.trim() || null,
        personType: 'student',
        status: 'provisional',
      });

      await deps.students.create(tx, {
        id: studentId, tenantId: actor.tenantId, personId: person.id,
        enrolmentNumber, programId: input.programId, admittedOn: input.admittedOn,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'student.admitted', subjectType: 'student', subjectId: studentId,
        after: {
          enrolmentNumber, programId: input.programId, admittedOn: input.admittedOn,
          personId: person.id,
        },
      }, tx);

      return Ok({ id: studentId, personId: person.id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `Enrolment number ${enrolmentNumber} is already in use.`, {
        fieldErrors: { enrolmentNumber: 'Already in use' },
      }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listStudents(
  deps: EnrolmentDeps, actor: EnrolmentActor, filter: StudentFilter,
): Promise<StudentRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.students.list(tx, filter));
}

export function readStudent(
  deps: EnrolmentDeps, actor: EnrolmentActor, id: string,
): Promise<StudentRecord | null> {
  return deps.uow.run(actor.tenantId, (tx) => deps.students.findById(tx, id));
}

export function membershipHistory(
  deps: EnrolmentDeps, actor: EnrolmentActor, studentId: string,
): Promise<MembershipRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.memberships.historyFor(tx, studentId));
}

/**
 * Changes a student's academic standing.
 *
 * Leaving the college ends their cohort placement and every live course
 * enrolment from the same date, so no roster expects them tomorrow. Nothing is
 * deleted: every sheet they were ever on still shows them, marked as they were.
 */
export async function setStudentStatus(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { id: string; status: StudentStatus; reason: string | null },
): Promise<Result<{ id: string }>> {
  if ((input.status === 'withdrawn' || input.status === 'on_leave') && !input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. It explains the record later.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const on = todayIso(deps.clock);
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const student = await deps.students.findById(tx, input.id);
    if (!student) return Err(fail('NOT_FOUND', 'That student was not found.'));
    if (student.status === input.status) {
      return Err(fail('CONFLICT', `That student is already ${input.status.replace('_', ' ')}.`));
    }

    const changed = await deps.students.setStatus(tx, {
      id: input.id, status: input.status, reason: input.reason?.trim() ?? null,
    });
    if (!changed) return Err(fail('CONFLICT', 'That student was changed by someone else just now.'));

    let released = 0;
    if (input.status === 'withdrawn' || input.status === 'graduated') {
      released = await releaseFromCohort(deps, actor, {
        student, on, reason: `Student ${input.status}`, tx,
      });
    }

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: `student.${input.status}`, subjectType: 'student', subjectId: input.id,
      before: { status: student.status },
      after: {
        status: input.status, enrolmentNumber: student.enrolmentNumber,
        coursesReleased: released,
      },
      reason: input.reason?.trim() ?? null,
    }, tx);

    return Ok({ id: input.id });
  }), 'That student could not be changed.');
}

/**
 * Places a student in a cohort, and enrols them in what that cohort is taught.
 *
 * Enrolment is created in bulk rather than typed, because a registrar placing a
 * student into term five is not making eight separate decisions about eight
 * core courses. Electives are then dropped individually.
 */
export async function placeInSection(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { studentId: string; sectionId: string; from: string | null },
): Promise<Result<{ id: string; coursesEnrolled: number }>> {
  const membershipId = deps.ids.next();
  const from = input.from ?? todayIso(deps.clock);

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const student = await deps.students.findById(tx, input.studentId);
      if (!student) return Err(fail('NOT_FOUND', 'That student was not found.'));
      if (student.status !== 'enrolled') {
        return Err(fail('CONFLICT',
          `${student.fullName} is ${student.status.replace('_', ' ')} and cannot be placed in a cohort.`));
      }

      const section = await deps.sections.findById(tx, input.sectionId);
      if (!section) return Err(fail('NOT_FOUND', 'That section was not found.'));
      if (section.status === 'completed' || section.status === 'cancelled') {
        return Err(fail('CONFLICT',
          `Section ${section.label} is ${section.status}, so nobody can be placed in it.`));
      }

      const existing = await deps.memberships.findLive(tx, input.studentId, input.sectionId);
      if (existing) {
        return Err(fail('CONFLICT', `${student.fullName} is already in section ${section.label}.`));
      }

      await deps.memberships.place(tx, {
        id: membershipId, tenantId: actor.tenantId, studentId: input.studentId,
        sectionId: input.sectionId, from, placedBy: actor.personId,
      });

      const offerings = (await deps.offerings.list(tx, { sectionId: input.sectionId }))
        .filter((o) => o.status === 'planned' || o.status === 'active');
      for (const offering of offerings) {
        await deps.enrolments.enrol(tx, {
          id: deps.ids.next(), tenantId: actor.tenantId, studentId: input.studentId,
          offeringId: offering.id, from, enrolledBy: actor.personId,
        });
      }

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'student.placed', subjectType: 'student', subjectId: input.studentId,
        scopeType: 'section', scopeRefId: input.sectionId,
        after: {
          section: section.label, program: section.programName, from,
          coursesEnrolled: offerings.length,
        },
      }, tx);

      return Ok({ id: membershipId, coursesEnrolled: offerings.length });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/** Ends a cohort placement, and with it every live enrolment in that cohort. */
export async function endPlacement(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { studentId: string; sectionId: string; on: string | null; reason: string },
): Promise<Result<{ coursesReleased: number }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. A cohort change needs explaining.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const on = input.on ?? todayIso(deps.clock);
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const student = await deps.students.findById(tx, input.studentId);
    if (!student) return Err(fail('NOT_FOUND', 'That student was not found.'));

    const membership = await deps.memberships.findLive(tx, input.studentId, input.sectionId);
    if (!membership) {
      return Err(fail('NOT_FOUND', 'That student is not in that section.'));
    }
    // A placement cannot end before it began. The constraint refuses it too;
    // this says which date is the problem.
    if (on < membership.validFrom) {
      return Err(fail('VALIDATION_FAILED',
        `${student.fullName} joined this cohort on ${membership.validFrom}, so it cannot end on ${on}.`,
        { fieldErrors: { on: 'Earlier than the placement started' } }));
    }

    const ended = await deps.memberships.end(tx, {
      id: membership.id, on, endedBy: actor.personId, reason: input.reason.trim(),
    });
    if (!ended) return Err(fail('CONFLICT', 'That placement was changed by someone else just now.'));

    const live = await deps.enrolments.liveForStudentInSection(tx, input.studentId, input.sectionId);
    for (const enrolment of live) {
      await deps.enrolments.end(tx, {
        id: enrolment.id, on, endedBy: actor.personId, reason: input.reason.trim(),
      });
    }

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'student.placement_ended', subjectType: 'student', subjectId: input.studentId,
      scopeType: 'section', scopeRefId: input.sectionId,
      before: { from: membership.validFrom },
      after: {
        to: on, coursesReleased: live.length, enrolmentNumber: student.enrolmentNumber,
      },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ coursesReleased: live.length });
  }), 'That placement could not be ended.');
}

/* ------------------------------------------------------- course enrolment -- */

export function roster(
  deps: EnrolmentDeps, actor: EnrolmentActor, offeringId: string, onDate: string,
): Promise<RosterEntry[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.enrolments.rosterAsOf(tx, offeringId, onDate));
}

/** One student into one course: how an elective is chosen. */
export async function enrolInOffering(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { studentId: string; offeringId: string; from: string | null },
): Promise<Result<{ id: string }>> {
  const id = deps.ids.next();
  const from = input.from ?? todayIso(deps.clock);

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const student = await deps.students.findById(tx, input.studentId);
      if (!student) return Err(fail('NOT_FOUND', 'That student was not found.'));

      const offering = await deps.offerings.findById(tx, input.offeringId);
      if (!offering) return Err(fail('NOT_FOUND', 'That course was not found.'));

      const existing = await deps.enrolments.findLive(tx, input.studentId, input.offeringId);
      if (existing) {
        return Err(fail('CONFLICT', `${student.fullName} already takes ${offering.courseCode}.`));
      }

      await deps.enrolments.enrol(tx, {
        id, tenantId: actor.tenantId, studentId: input.studentId,
        offeringId: input.offeringId, from, enrolledBy: actor.personId,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'enrolment.added', subjectType: 'offering_enrolment', subjectId: id,
        scopeType: 'section', scopeRefId: offering.sectionId,
        after: {
          student: student.enrolmentNumber, course: offering.courseCode,
          section: offering.sectionLabel, from,
        },
      }, tx);

      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/** Drops one student from one course. The rows they already appear on stand. */
export async function dropFromOffering(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { studentId: string; offeringId: string; on: string | null; reason: string },
): Promise<Result<{ ended: true }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const on = input.on ?? todayIso(deps.clock);
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const offering = await deps.offerings.findById(tx, input.offeringId);
    if (!offering) return Err(fail('NOT_FOUND', 'That course was not found.'));

    const enrolment = await deps.enrolments.findLive(tx, input.studentId, input.offeringId);
    if (!enrolment) return Err(fail('NOT_FOUND', 'That student does not take that course.'));
    if (on < enrolment.validFrom) {
      return Err(fail('VALIDATION_FAILED',
        `That enrolment began on ${enrolment.validFrom}, so it cannot end on ${on}.`,
        { fieldErrors: { on: 'Earlier than the enrolment started' } }));
    }

    const ended = await deps.enrolments.end(tx, {
      id: enrolment.id, on, endedBy: actor.personId, reason: input.reason.trim(),
    });
    if (!ended) return Err(fail('CONFLICT', 'That enrolment was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'enrolment.ended', subjectType: 'offering_enrolment', subjectId: enrolment.id,
      scopeType: 'section', scopeRefId: offering.sectionId,
      after: { course: offering.courseCode, to: on },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ ended: true as const });
  }), 'That enrolment could not be ended.');
}

/**
 * Enrols a cohort in a course added after they were placed.
 *
 * An explicit action rather than a hidden side effect of creating the offering:
 * an operator adding a course in week three should be told how many students it
 * just gave a class to.
 */
export async function enrolCohort(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { offeringId: string; from: string | null },
): Promise<Result<{ enrolled: number; alreadyThere: number }>> {
  const from = input.from ?? todayIso(deps.clock);

  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const offering = await deps.offerings.findById(tx, input.offeringId);
    if (!offering) return Err(fail('NOT_FOUND', 'That course was not found.'));
    if (offering.status === 'completed' || offering.status === 'cancelled') {
      return Err(fail('CONFLICT',
        `${offering.courseCode} is ${offering.status}, so nobody can be enrolled in it.`));
    }

    const members = await deps.memberships.liveMemberIds(tx, offering.sectionId);
    const already = new Set(await deps.enrolments.liveStudentIds(tx, input.offeringId));
    const toEnrol = members.filter((id) => !already.has(id));

    for (const studentId of toEnrol) {
      await deps.enrolments.enrol(tx, {
        id: deps.ids.next(), tenantId: actor.tenantId, studentId,
        offeringId: input.offeringId, from, enrolledBy: actor.personId,
      });
    }

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'enrolment.cohort_added', subjectType: 'course_offering',
      subjectId: input.offeringId,
      scopeType: 'section', scopeRefId: offering.sectionId,
      after: {
        course: offering.courseCode, section: offering.sectionLabel,
        enrolled: toEnrol.length, alreadyThere: already.size, from,
      },
    }, tx);

    return Ok({ enrolled: toEnrol.length, alreadyThere: already.size });
  }), 'The cohort could not be enrolled.');
}

/** Ends every live placement and enrolment a student holds, from one date. */
async function releaseFromCohort(
  deps: EnrolmentDeps,
  actor: EnrolmentActor,
  input: { student: StudentRecord; on: string; reason: string; tx: Tx },
): Promise<number> {
  if (!input.student.sectionId) return 0;

  const membership = await deps.memberships.findLive(
    input.tx, input.student.id, input.student.sectionId,
  );
  if (membership) {
    await deps.memberships.end(input.tx, {
      id: membership.id, on: input.on, endedBy: actor.personId, reason: input.reason,
    });
  }

  const live = await deps.enrolments.liveForStudentInSection(
    input.tx, input.student.id, input.student.sectionId,
  );
  for (const enrolment of live) {
    await deps.enrolments.end(input.tx, {
      id: enrolment.id, on: input.on, endedBy: actor.personId, reason: input.reason,
    });
  }
  return live.length;
}

/**
 * CourseOffering and instructor assignment: the operational bridge from
 * curriculum, through a cohort, to actual teaching.
 *
 * An offering never touches curriculum. Credits and requirement live on the
 * curriculum entry and are immutable once published, which is what keeps a
 * student's transcript stable when a later regulation changes.
 *
 * See docs/blueprint/modules/m3-course-offering.md.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  AssignmentHistoryRecord, InstructorAssignmentRepository, InstructorRole,
  OfferingComponent, OfferingFilter, OfferingRecord, OfferingRepository,
  OfferingStatus, SectionRepository,
} from './ports.ts';

export interface OfferingActor {
  tenantId: string;
  personId: string;
}

export interface OfferingDeps {
  uow: UnitOfWork;
  offerings: OfferingRepository;
  instructors: InstructorAssignmentRepository;
  sections: SectionRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/* --------------------------------------------------------------- offerings -- */

export async function createOffering(
  deps: OfferingDeps,
  actor: OfferingActor,
  input: { sectionId: string; courseId: string; component: OfferingComponent },
): Promise<Result<{ id: string }>> {
  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const section = await deps.sections.findById(tx, input.sectionId);
      if (!section) {
        return Err(fail('VALIDATION_FAILED', 'Choose a section.', {
          fieldErrors: { sectionId: 'Not found' },
        }));
      }
      if (section.status === 'completed' || section.status === 'cancelled') {
        return Err(fail('CONFLICT',
          `Section ${section.label} is ${section.status}, so no more teaching can be added to it.`));
      }

      await deps.offerings.create(tx, {
        id, tenantId: actor.tenantId, sectionId: input.sectionId,
        courseId: input.courseId, component: input.component,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'offering.created', subjectType: 'course_offering', subjectId: id,
        scopeType: 'section', scopeRefId: input.sectionId,
        after: { section: section.label, component: input.component, courseId: input.courseId },
      }, tx);

      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT',
        `That course is already offered to this section as a ${input.component}.`));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listOfferings(
  deps: OfferingDeps, actor: OfferingActor, filter: OfferingFilter,
): Promise<OfferingRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.offerings.list(tx, filter));
}

export function readOffering(
  deps: OfferingDeps, actor: OfferingActor, id: string,
): Promise<OfferingRecord | null> {
  return deps.uow.run(actor.tenantId, (tx) => deps.offerings.findById(tx, id));
}

export function offeringHistory(
  deps: OfferingDeps, actor: OfferingActor, offeringId: string,
): Promise<AssignmentHistoryRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.instructors.history(tx, offeringId));
}

/**
 * What the signed-in person teaches. Derived entirely from their own id, never
 * from anything the client sends, which is the whole point of the endpoint.
 */
export function myTeaching(
  deps: OfferingDeps, actor: OfferingActor, filter: { termId?: string | null } = {},
): Promise<OfferingRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.offerings.list(tx, {
    instructorPersonId: actor.personId,
    termId: filter.termId ?? null,
  }));
}

const ALLOWED: Record<OfferingStatus, OfferingStatus[]> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function transitionOffering(
  deps: OfferingDeps,
  actor: OfferingActor,
  input: { id: string; to: OfferingStatus; reason?: string | null },
): Promise<Result<{ status: OfferingStatus }>> {
  if (input.to === 'cancelled' && !input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for cancelling.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const offering = await deps.offerings.findById(tx, input.id);
      if (!offering) return Err(fail('NOT_FOUND', 'That offering was not found.'));

      if (offering.status === input.to) {
        return Err(fail('CONFLICT', `That offering is already ${input.to}.`));
      }
      if (!ALLOWED[offering.status].includes(input.to)) {
        return Err(fail('CONFLICT', offeringRefusal(offering.status, input.to)));
      }
      // Teaching a cohort that has not started is meaningless. The trigger
      // refuses it too; this says so in words an operator can act on.
      if (input.to === 'active' && offering.sectionStatus !== 'active') {
        return Err(fail('CONFLICT',
          `Section ${offering.sectionLabel} is ${offering.sectionStatus} and is not yet teaching. Start the section first.`));
      }
      if (input.to === 'active' && offering.instructors.length === 0) {
        return Err(fail('CONFLICT',
          'Assign an instructor before this course starts. Attendance is recorded against whoever is teaching.'));
      }

      const moved = await deps.offerings.transition(tx, {
        id: input.id, from: offering.status, to: input.to, at,
        reason: input.reason?.trim() ?? null,
      });
      if (!moved) return Err(fail('CONFLICT', 'That offering was changed by someone else just now.'));

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: `offering.${input.to}`, subjectType: 'course_offering', subjectId: input.id,
        scopeType: 'section', scopeRefId: offering.sectionId,
        before: { status: offering.status },
        after: { status: input.to, course: offering.courseCode, section: offering.sectionLabel },
        reason: input.reason?.trim() ?? null,
      }, tx);

      return Ok({ status: input.to });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/* ------------------------------------------------------------- instructors -- */

export async function assignInstructor(
  deps: OfferingDeps,
  actor: OfferingActor,
  input: { offeringId: string; personId: string; role: InstructorRole },
): Promise<Result<{ assignmentId: string }>> {
  const id = deps.ids.next();
  const at = deps.clock.now();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const offering = await deps.offerings.findById(tx, input.offeringId);
      if (!offering) return Err(fail('NOT_FOUND', 'That offering was not found.'));
      if (offering.status === 'completed' || offering.status === 'cancelled') {
        return Err(fail('CONFLICT',
          `This offering is ${offering.status}. Its teaching history stays as it was recorded.`));
      }

      const existing = await deps.instructors.findLive(tx, input.offeringId, input.personId);
      if (existing) {
        return Err(fail('CONFLICT', `That person already teaches this course as ${existing.role}.`));
      }

      await deps.instructors.assign(tx, {
        id, tenantId: actor.tenantId, offeringId: input.offeringId,
        personId: input.personId, role: input.role, assignedBy: actor.personId, at,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'instructor.assigned', subjectType: 'instructor_assignment', subjectId: id,
        scopeType: 'section', scopeRefId: offering.sectionId,
        after: {
          offering: input.offeringId, personId: input.personId, role: input.role,
          course: offering.courseCode, section: offering.sectionLabel,
        },
      }, tx);

      return Ok({ assignmentId: id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT',
        input.role === 'lead'
          ? 'This offering already has a lead instructor. End that assignment first, or assign this person as co-instructor.'
          : 'That person is already assigned to this offering.'));
    }
    if (e instanceof AppException && e.code === 'VALIDATION_FAILED') {
      // The trigger refused: not staff, or a different institution.
      return Err(fail('VALIDATION_FAILED', e.message, { fieldErrors: { personId: 'Not eligible' } }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/**
 * Ends an assignment. Never deletes it.
 *
 * Attendance taken in week three was taken by whoever was teaching then, so the
 * record of that has to survive the handover. The reason is required because a
 * bare end date does not explain a mid-term change to anyone reading it later.
 */
export async function endInstructorAssignment(
  deps: OfferingDeps,
  actor: OfferingActor,
  input: { assignmentId: string; reason: string },
): Promise<Result<{ ended: true }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. It explains the handover later.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const assignment = await deps.instructors.findLiveById(tx, input.assignmentId);
    if (!assignment) return Err(fail('NOT_FOUND', 'That assignment has already ended.'));

    const ended = await deps.instructors.end(tx, {
      id: input.assignmentId, endedBy: actor.personId, reason: input.reason.trim(), at,
    });
    if (!ended) return Err(fail('CONFLICT', 'That assignment was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'instructor.ended', subjectType: 'instructor_assignment',
      subjectId: input.assignmentId,
      before: { personId: assignment.personId, role: assignment.role },
      after: { endedAt: at.toISOString() },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ ended: true as const });
  });
}

/**
 * Called by the section lifecycle when a section completes.
 *
 * The term ending is the natural end of its teaching, so this cascades rather
 * than asking an operator to close fifty offerings by hand. Each is audited
 * individually, so the cascade is visible rather than silent.
 */
export async function completeOfferingsForSection(
  deps: OfferingDeps,
  actor: OfferingActor,
  input: { sectionId: string; at: Date },
): Promise<number> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const completed = await deps.offerings.completeActiveForSection(tx, input.sectionId, input.at);
    for (const offeringId of completed) {
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'offering.completed', subjectType: 'course_offering', subjectId: offeringId,
        scopeType: 'section', scopeRefId: input.sectionId,
        before: { status: 'active' }, after: { status: 'completed' },
        reason: 'The section completed, ending its teaching',
      }, tx);
    }
    return completed.length;
  });
}

export function activeOfferingsForSection(
  deps: OfferingDeps, actor: OfferingActor, sectionId: string,
): Promise<OfferingRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.offerings.listActiveForSection(tx, sectionId));
}

function offeringRefusal(from: OfferingStatus, to: OfferingStatus): string {
  if (from === 'completed') {
    return 'This course has finished. Attendance and results reference it, so it stays as it is.';
  }
  if (from === 'cancelled') return 'This offering was cancelled and cannot be restarted.';
  return `An offering cannot go from ${from} to ${to}.`;
}

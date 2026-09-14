/**
 * M3 Teaching Operations, slice one: sections.
 *
 * A section is a cohort of students within a program, for one term. It is not
 * an offering of a course; that is CourseOffering, and it carries the
 * instructor. See docs/blueprint/modules/m3-teaching-operations.md.
 *
 * M3 owns section existence and lifecycle. It owns no student, no course and no
 * program: it references them.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  AcademicYearRecord, AcademicYearRepository, OfferingRepository, SectionFilter,
  SectionRecord, SectionRepository, SectionStatus, TermRecord, TermRepository,
} from './ports.ts';
import { occupancyOfSection } from './section-capability.ts';

export interface TeachingActor {
  tenantId: string;
  personId: string;
}

export interface TeachingDeps {
  uow: UnitOfWork;
  years: AcademicYearRepository;
  terms: TermRepository;
  sections: SectionRepository;
  /** Same module: a section's lifecycle reaches its own teaching. */
  offerings: OfferingRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/* -------------------------------------------------------- academic period -- */

export async function createAcademicYear(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { name: string; startsOn: string; endsOn: string; makeCurrent: boolean },
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (name.length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Name the academic year as your college writes it.', {
      fieldErrors: { name: 'Required' },
    }));
  }
  if (!(new Date(input.endsOn) > new Date(input.startsOn))) {
    return Err(fail('VALIDATION_FAILED', 'The year must end after it starts.', {
      fieldErrors: { endsOn: 'Must be later' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      // Exactly one current year, so every downstream module gets one answer.
      if (input.makeCurrent) await deps.years.clearCurrent(tx);
      await deps.years.create(tx, {
        id, tenantId: actor.tenantId, name,
        startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: input.makeCurrent,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'academic_year.created', subjectType: 'academic_year', subjectId: id,
        after: { name, startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: input.makeCurrent },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `${name} already exists.`, { fieldErrors: { name: 'Already used' } }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function createTerm(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { academicYearId: string; sequence: number; name: string; startsOn: string; endsOn: string },
): Promise<Result<{ id: string }>> {
  if (!(new Date(input.endsOn) > new Date(input.startsOn))) {
    return Err(fail('VALIDATION_FAILED', 'The term must end after it starts.', {
      fieldErrors: { endsOn: 'Must be later' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const year = await deps.years.findById(tx, input.academicYearId);
      if (!year) {
        return Err(fail('VALIDATION_FAILED', 'Choose an academic year.', {
          fieldErrors: { academicYearId: 'Not found' },
        }));
      }
      // A term outside its year would make every date question ambiguous.
      if (new Date(input.startsOn) < new Date(year.startsOn)
          || new Date(input.endsOn) > new Date(year.endsOn)) {
        return Err(fail('VALIDATION_FAILED',
          `A term must fall inside ${year.name}, which runs ${year.startsOn} to ${year.endsOn}.`,
          { fieldErrors: { startsOn: 'Outside the academic year' } }));
      }

      await deps.terms.create(tx, {
        id, tenantId: actor.tenantId, academicYearId: input.academicYearId,
        sequence: input.sequence, name: input.name.trim(),
        startsOn: input.startsOn, endsOn: input.endsOn,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'term.created', subjectType: 'term', subjectId: id,
        after: { name: input.name.trim(), sequence: input.sequence, academicYear: year.name },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `That year already has a term ${input.sequence}.`));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/* ------------------------------------- FB-2: correcting and removing them -- */

const sameDay = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function updateAcademicYear(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { id: string; name?: string; startsOn?: string; endsOn?: string; makeCurrent?: boolean },
): Promise<Result<{ updated: true }>> {
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const year = await deps.years.findById(tx, input.id);
      if (!year || year.status === 'archived') return Err(fail('NOT_FOUND', 'That academic year was not found.'));

      const name = (input.name ?? year.name).trim();
      const startsOn = input.startsOn ?? year.startsOn;
      const endsOn = input.endsOn ?? year.endsOn;
      if (name.length < 2) {
        return Err(fail('VALIDATION_FAILED', 'Name the academic year as your college writes it.', {
          fieldErrors: { name: 'Required' },
        }));
      }
      if (!(new Date(endsOn) > new Date(startsOn))) {
        return Err(fail('VALIDATION_FAILED', 'The year must end after it starts.', {
          fieldErrors: { endsOn: 'Must be later' },
        }));
      }
      // Every term must still fall inside its year, or its dates become ambiguous.
      const outside = (await deps.terms.list(tx, year.id)).find(
        (t) => new Date(t.startsOn) < new Date(startsOn) || new Date(t.endsOn) > new Date(endsOn),
      );
      if (outside) {
        return Err(fail('VALIDATION_FAILED',
          `${outside.name} runs ${outside.startsOn} to ${outside.endsOn}, outside those dates. Change it first.`,
          { fieldErrors: { startsOn: 'A term would fall outside' } }));
      }

      await deps.years.update(tx, year.id, { name, startsOn, endsOn });
      const makeCurrent = input.makeCurrent === true && !year.isCurrent;
      if (makeCurrent) {
        await deps.years.clearCurrent(tx);
        await deps.years.setCurrent(tx, year.id);
      }
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'academic_year.updated', subjectType: 'academic_year', subjectId: year.id,
        before: { name: year.name, startsOn: year.startsOn, endsOn: year.endsOn, isCurrent: year.isCurrent },
        after: { name, startsOn, endsOn, isCurrent: year.isCurrent || makeCurrent },
      }, tx);
      return Ok({ updated: true as const });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `${input.name?.trim()} already exists.`, { fieldErrors: { name: 'Already used' } }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function archiveAcademicYear(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { id: string; reason?: string },
): Promise<Result<{ archived: true }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const year = await deps.years.findById(tx, input.id);
    if (!year || year.status === 'archived') return Err(fail('NOT_FOUND', 'That academic year was not found.'));
    // Every module asks for the current year; there must always be an answer.
    if (year.isCurrent) {
      return Err(fail('CONFLICT', `${year.name} is the current year. Make another year current before removing it.`));
    }
    if (year.termCount > 0) {
      return Err(fail('CONFLICT', `${year.name} still has ${plural(year.termCount, 'term', 'terms')}. Remove them first.`));
    }
    const sections = await deps.sections.list(tx, { academicYearId: year.id });
    if (sections.length > 0) {
      return Err(fail('CONFLICT', `${plural(sections.length, 'section belongs', 'sections belong')} to ${year.name}, so it cannot be removed.`));
    }

    const archived = await deps.years.archive(tx, year.id, actor.personId, deps.clock.now());
    if (!archived) return Err(fail('CONFLICT', 'That academic year was changed by someone else just now.'));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'academic_year.archived', subjectType: 'academic_year', subjectId: year.id,
      before: { name: year.name, status: year.status }, after: { status: 'archived' },
      reason: input.reason?.trim() || null,
    }, tx);
    return Ok({ archived: true as const });
  });
}

export async function updateTerm(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { id: string; name?: string; startsOn?: string; endsOn?: string },
): Promise<Result<{ updated: true }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const term = await deps.terms.findById(tx, input.id);
    if (!term || term.status === 'archived') return Err(fail('NOT_FOUND', 'That term was not found.'));

    const name = (input.name ?? term.name).trim();
    const startsOn = input.startsOn ?? term.startsOn;
    const endsOn = input.endsOn ?? term.endsOn;
    if (!name) return Err(fail('VALIDATION_FAILED', 'Name the term.', { fieldErrors: { name: 'Required' } }));
    if (!(new Date(endsOn) > new Date(startsOn))) {
      return Err(fail('VALIDATION_FAILED', 'The term must end after it starts.', {
        fieldErrors: { endsOn: 'Must be later' },
      }));
    }

    if (!sameDay(startsOn, term.startsOn) || !sameDay(endsOn, term.endsOn)) {
      const year = await deps.years.findById(tx, term.academicYearId);
      if (year && (new Date(startsOn) < new Date(year.startsOn) || new Date(endsOn) > new Date(year.endsOn))) {
        return Err(fail('VALIDATION_FAILED',
          `A term must fall inside ${year.name}, which runs ${year.startsOn} to ${year.endsOn}.`,
          { fieldErrors: { startsOn: 'Outside the academic year' } }));
      }
      // Classes and registers are dated inside the term. Once a section is in
      // it, moving the dates would strand them; the name can still change.
      const sections = await deps.sections.list(tx, { termId: term.id });
      if (sections.length > 0) {
        return Err(fail('CONFLICT',
          `${plural(sections.length, 'section uses', 'sections use')} ${term.name}, so its dates are fixed. Its name can still change.`));
      }
    }

    const updated = await deps.terms.update(tx, term.id, { name, startsOn, endsOn });
    if (!updated) return Err(fail('CONFLICT', 'That term was changed by someone else just now.'));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'term.updated', subjectType: 'term', subjectId: term.id,
      before: { name: term.name, startsOn: term.startsOn, endsOn: term.endsOn },
      after: { name, startsOn, endsOn },
    }, tx);
    return Ok({ updated: true as const });
  });
}

export async function archiveTerm(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { id: string; reason?: string },
): Promise<Result<{ archived: true }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const term = await deps.terms.findById(tx, input.id);
    if (!term || term.status === 'archived') return Err(fail('NOT_FOUND', 'That term was not found.'));
    const sections = await deps.sections.list(tx, { termId: term.id });
    if (sections.length > 0) {
      return Err(fail('CONFLICT', `${plural(sections.length, 'section uses', 'sections use')} ${term.name}, so it cannot be removed.`));
    }

    const archived = await deps.terms.archive(tx, term.id, actor.personId, deps.clock.now());
    if (!archived) return Err(fail('CONFLICT', 'That term was changed by someone else just now.'));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'term.archived', subjectType: 'term', subjectId: term.id,
      before: { name: term.name, status: term.status }, after: { status: 'archived' },
      reason: input.reason?.trim() || null,
    }, tx);
    return Ok({ archived: true as const });
  });
}

export function listAcademicYears(
  deps: TeachingDeps, actor: TeachingActor,
): Promise<AcademicYearRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.years.list(tx));
}

export function listTerms(
  deps: TeachingDeps, actor: TeachingActor, academicYearId: string | null,
): Promise<TermRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.terms.list(tx, academicYearId));
}

/* ---------------------------------------------------------------- sections -- */

export async function createSection(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: {
    programId: string; termId: string; termNumber: number;
    label: string; capacity?: number | null;
  },
): Promise<Result<{ id: string }>> {
  const label = input.label.trim().toUpperCase();
  if (label.length < 1 || label.length > 12) {
    return Err(fail('VALIDATION_FAILED', 'Give the section a short label, such as A.', {
      fieldErrors: { label: 'Required' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const term = await deps.terms.findById(tx, input.termId);
      if (!term) {
        return Err(fail('VALIDATION_FAILED', 'Choose a term.', {
          fieldErrors: { termId: 'Not found' },
        }));
      }

      await deps.sections.create(tx, {
        id, tenantId: actor.tenantId, programId: input.programId,
        // Derived from the term rather than accepted from the caller, so a
        // section can never claim a year its term does not belong to.
        academicYearId: term.academicYearId,
        termId: input.termId, termNumber: input.termNumber, label,
        capacity: input.capacity ?? null,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'section.created', subjectType: 'section', subjectId: id,
        scopeType: 'section', scopeRefId: id,
        after: {
          label, termNumber: input.termNumber, term: term.name,
          academicYear: term.academicYearName, capacity: input.capacity ?? null,
        },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT',
        `Section ${label} already exists for that program, year and term.`,
        { fieldErrors: { label: 'Already used' } }));
    }
    if (e instanceof AppException && e.code === 'VALIDATION_FAILED') {
      // The trigger refused: term beyond the program's length, or an unknown
      // program. Its message is already specific, so it is passed through.
      return Err(fail('VALIDATION_FAILED', e.message, { fieldErrors: { termNumber: 'Out of range' } }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listSections(
  deps: TeachingDeps, actor: TeachingActor, filter: SectionFilter,
): Promise<SectionRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sections.list(tx, filter));
}

export function readSection(
  deps: TeachingDeps, actor: TeachingActor, id: string,
): Promise<SectionRecord | null> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sections.findById(tx, id));
}

/** The transitions the lifecycle permits, mirrored from the database trigger. */
const ALLOWED: Record<SectionStatus, SectionStatus[]> = {
  planned: ['open', 'cancelled'],
  open: ['planned', 'active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function transitionSection(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { id: string; to: SectionStatus; reason?: string | null },
): Promise<Result<{ status: SectionStatus }>> {
  if (input.to === 'cancelled' && !input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for cancelling.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const section = await deps.sections.findById(tx, input.id);
      if (!section) return Err(fail('NOT_FOUND', 'That section was not found.'));

      if (section.status === input.to) {
        return Err(fail('CONFLICT', `That section is already ${input.to}.`));
      }
      if (!ALLOWED[section.status].includes(input.to)) {
        return Err(fail('CONFLICT', refusal(section.status, input.to)));
      }

      // Cancelling out from under enrolled students would hide the consequence
      // at the moment of the decision, which is what AD-27 refuses elsewhere.
      if (input.to === 'cancelled') {
        const occupancy = await occupancyOfSection(tx, input.id);
        if (occupancy.enrolled > 0) {
          return Err(fail('CONFLICT',
            `${occupancy.enrolled} ${occupancy.enrolled === 1 ? 'student is' : 'students are'} enrolled in section ${section.label}. Move them before cancelling it.`));
        }

        // Cancelling claims the teaching should not have happened, which is a
        // different statement from "the term ended". Each active course needs
        // its own decision, so this refuses rather than cascading.
        const active = await deps.offerings.listActiveForSection(tx, input.id);
        if (active.length > 0) {
          const names = active.slice(0, 3).map((o) => o.courseCode).join(', ');
          const rest = active.length - Math.min(active.length, 3);
          return Err(fail('CONFLICT',
            `${names}${rest > 0 ? ` and ${rest} more` : ''} ${active.length === 1 ? 'is' : 'are'} still being taught in section ${section.label}. Cancel or complete them first.`));
        }
      }

      const moved = await deps.sections.transition(tx, {
        id: input.id, from: section.status, to: input.to, at,
        reason: input.reason?.trim() ?? null,
      });
      if (!moved) return Err(fail('CONFLICT', 'That section was changed by someone else just now.'));

      // The term ending is the natural end of its teaching, so completion
      // cascades rather than asking an operator to close fifty offerings by
      // hand. Each one is audited individually, so the cascade is visible.
      let completedOfferings = 0;
      if (input.to === 'completed') {
        const ids = await deps.offerings.completeActiveForSection(tx, input.id, at);
        completedOfferings = ids.length;
        for (const offeringId of ids) {
          await deps.audit.record({
            correlationId: deps.ids.next(), tenantId: actor.tenantId,
            actorType: 'person', actorId: actor.personId,
            action: 'offering.completed', subjectType: 'course_offering', subjectId: offeringId,
            scopeType: 'section', scopeRefId: input.id,
            before: { status: 'active' }, after: { status: 'completed' },
            reason: 'The section completed, ending its teaching',
          }, tx);
        }
      }

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: `section.${input.to}`, subjectType: 'section', subjectId: input.id,
        scopeType: 'section', scopeRefId: input.id,
        before: { status: section.status },
        after: {
          status: input.to, label: section.label,
          ...(completedOfferings > 0 ? { completedOfferings } : {}),
        },
        reason: input.reason?.trim() ?? null,
      }, tx);

      return Ok({ status: input.to });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function setSectionCapacity(
  deps: TeachingDeps,
  actor: TeachingActor,
  input: { id: string; capacity: number | null },
): Promise<Result<{ capacity: number | null }>> {
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
    return Err(fail('VALIDATION_FAILED', 'Capacity must be a whole number above zero.', {
      fieldErrors: { capacity: 'Invalid' },
    }));
  }

  return deps.uow.run(actor.tenantId, async (tx) => {
    const section = await deps.sections.findById(tx, input.id);
    if (!section) return Err(fail('NOT_FOUND', 'That section was not found.'));
    if (section.status === 'completed' || section.status === 'cancelled') {
      return Err(fail('CONFLICT', `Section ${section.label} is ${section.status} and cannot change.`));
    }

    const updated = await deps.sections.setCapacity(tx, input.id, input.capacity);
    if (!updated) return Err(fail('CONFLICT', 'That section was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'section.capacity_changed', subjectType: 'section', subjectId: input.id,
      scopeType: 'section', scopeRefId: input.id,
      before: { capacity: section.capacity }, after: { capacity: input.capacity },
    }, tx);

    return Ok({ capacity: input.capacity });
  });
}

function refusal(from: SectionStatus, to: SectionStatus): string {
  if (from === 'completed') {
    return 'This section has finished. Attendance and results reference it, so it stays as it is.';
  }
  if (from === 'cancelled') return 'This section was cancelled and cannot be reopened.';
  if (from === 'active' && to === 'planned') {
    return 'Teaching has begun, so this section cannot go back to planning.';
  }
  return `A section cannot go from ${from} to ${to}.`;
}

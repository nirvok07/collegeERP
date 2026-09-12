/**
 * M7 Internal Assessment: the plan, the mark sheet, and corrections.
 *
 * The plan is departmental; the marks are the teacher's. A sheet goes draft,
 * submitted, verified, and never back: a head of department who finds an error
 * corrects it with a reason rather than unlocking the sheet (AD-51's rule).
 *
 * See docs/blueprint/modules/m7-internal-assessment.md.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail, violatedConstraint, type Failure } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { TeachingReachReader } from '../../delivery/application/ports.ts';
import type { EnrolmentRepository, RosterEntry } from '../../enrolment/application/ports.ts';
import type { OfferingRepository } from '../../teaching/application/ports.ts';
import type {
  AssessmentCorrectionRecord, AssessmentMarkRecord, AssessmentMarkRepository, ComponentFilter,
  ComponentKind, ComponentRecord, ComponentRepository, MarkStatus,
} from './ports.ts';

export interface AssessmentActor {
  tenantId: string;
  personId: string;
}

export interface AssessmentDeps {
  uow: UnitOfWork;
  components: ComponentRepository;
  marks: AssessmentMarkRepository;
  offerings: OfferingRepository;
  enrolments: EnrolmentRepository;
  reach: TeachingReachReader;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/**
 * How the caller is acting, which is AD-40 in one parameter. `administer` means
 * the permission is held institution-wide; `teach` means reach must be checked
 * against M3's assignments. Decided at the route, applied here.
 */
export type ActingAs = 'administer' | 'teach';

export interface SheetView {
  component: ComponentRecord;
  students: Array<RosterEntry & { mark: AssessmentMarkRecord | null }>;
  corrections: AssessmentCorrectionRecord[];
}

const todayIso = (clock: Clock) => clock.now().toISOString().slice(0, 10);

/** Two decimal places, because half marks are routine and thirds are not. */
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/**
 * Rounds for display. PostgreSQL renders numeric with its scale, so a refusal
 * left to the database reads "110.00"; checking here says "110", while the
 * database stays the guarantee against a concurrent write.
 */
const round2 = (value: number) => Math.round(value * 100) / 100;

const overweight = (total: number, claimed: number) => fail('VALIDATION_FAILED',
  `The weights of this course would total ${total}, and internal assessment cannot exceed 100.`,
  { fieldErrors: { weight: `At most ${round2(100 - claimed)} is left` } });

/* ------------------------------------------------------------------ reads -- */

export function listComponents(
  deps: AssessmentDeps, actor: AssessmentActor, filter: ComponentFilter,
): Promise<ComponentRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.components.list(tx, filter));
}

/**
 * The signed-in teacher's own components. Derived from their id, never from
 * anything the client sends, exactly as `/me/teaching` is.
 */
export function myComponents(
  deps: AssessmentDeps, actor: AssessmentActor,
): Promise<ComponentRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) =>
    deps.components.list(tx, { minePersonId: actor.personId }));
}

export function readComponent(
  deps: AssessmentDeps, actor: AssessmentActor, id: string,
): Promise<ComponentRecord | null> {
  return deps.uow.run(actor.tenantId, (tx) => deps.components.findById(tx, id));
}

export function weightTotal(
  deps: AssessmentDeps, actor: AssessmentActor, offeringId: string,
): Promise<number> {
  return deps.uow.run(actor.tenantId, (tx) => deps.components.weightTotal(tx, offeringId));
}

/**
 * A sheet: the component, its roster as of the day it was held, every mark,
 * and every correction. Before a date is recorded the roster is empty, because
 * who was expected cannot be answered without one (AD-50).
 */
export function readSheet(
  deps: AssessmentDeps, actor: AssessmentActor, id: string,
): Promise<SheetView | null> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, id);
    if (!component) return null;

    const roster = component.heldOn
      ? await deps.enrolments.rosterAsOf(tx, component.offeringId, component.heldOn)
      : [];
    const marks = await deps.marks.listForComponent(tx, id);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));

    return {
      component,
      students: roster.map((entry) => ({ ...entry, mark: byStudent.get(entry.studentId) ?? null })),
      corrections: await deps.marks.correctionsForComponent(tx, id),
    };
  });
}

/* ------------------------------------------------------------------- plan -- */

export async function planComponent(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: { offeringId: string; name: string; kind: ComponentKind; maxMarks: number; weight: number },
): Promise<Result<{ id: string }>> {
  const planned = validatePlan(input);
  if (planned) return Err(planned);

  const id = deps.ids.next();
  const name = input.name.trim();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const offering = await deps.offerings.findById(tx, input.offeringId);
    if (!offering) return Err(fail('NOT_FOUND', 'That course was not found.'));
    if (offering.status === 'cancelled') {
      return Err(fail('CONFLICT', `${offering.courseCode} was cancelled, so it takes no assessment.`));
    }

    const claimed = await deps.components.weightTotal(tx, input.offeringId);
    const total = round2(claimed + input.weight);
    if (total > 100) return Err(overweight(total, claimed));

    await deps.components.create(tx, {
      id, tenantId: actor.tenantId, offeringId: input.offeringId, name, kind: input.kind,
      maxMarks: input.maxMarks, weight: input.weight, createdBy: actor.personId,
    });

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.planned', subjectType: 'assessment_component', subjectId: id,
      scopeType: 'section', scopeRefId: offering.sectionId,
      after: {
        course: offering.courseCode, section: offering.sectionLabel, name, kind: input.kind,
        maxMarks: input.maxMarks, weight: input.weight,
      },
    }, tx);
    return Ok({ id });
  }), `A component named "${name}" already exists for this course.`);
}

export async function reviseComponent(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: {
    id: string; version: number; name: string; kind: ComponentKind; maxMarks: number; weight: number;
  },
): Promise<Result<{ version: number }>> {
  const planned = validatePlan(input);
  if (planned) return Err(planned);

  const name = input.name.trim();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, input.id);
    if (!component) return Err(fail('NOT_FOUND', 'That assessment was not found.'));
    if (component.status !== 'draft') {
      return Err(fail('CONFLICT', `This assessment is ${component.status}, so its plan is fixed.`));
    }
    if (component.version !== input.version) return Err(stale());

    const claimed = round2(
      (await deps.components.weightTotal(tx, component.offeringId)) - component.weight,
    );
    const total = round2(claimed + input.weight);
    if (total > 100) return Err(overweight(total, claimed));

    const revised = await deps.components.revise(tx, {
      id: input.id, name, kind: input.kind, maxMarks: input.maxMarks, weight: input.weight,
      expectedVersion: input.version,
    });
    if (!revised) return Err(stale());

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.revised', subjectType: 'assessment_component', subjectId: input.id,
      scopeType: 'section', scopeRefId: component.sectionId,
      before: {
        name: component.name, kind: component.kind,
        maxMarks: component.maxMarks, weight: component.weight,
      },
      after: { name, kind: input.kind, maxMarks: input.maxMarks, weight: input.weight },
    }, tx);
    return Ok({ version: input.version + 1 });
  }), `A component named "${name}" already exists for this course.`);
}

/** A component that was planned and never held. Refused once any mark exists. */
export async function cancelComponent(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: { id: string; version: number; reason: string },
): Promise<Result<{ id: string }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for cancelling.', {
      fieldErrors: { reason: 'Required' },
    }));
  }
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, input.id);
    if (!component) return Err(fail('NOT_FOUND', 'That assessment was not found.'));
    if (component.status !== 'draft') {
      return Err(fail('CONFLICT', `This assessment is ${component.status} and cannot be cancelled.`));
    }
    if (component.version !== input.version) return Err(stale());

    const cancelled = await deps.components.cancel(tx, {
      id: input.id, reason: input.reason.trim(), expectedVersion: input.version,
    });
    if (!cancelled) return Err(stale());

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.cancelled', subjectType: 'assessment_component', subjectId: input.id,
      scopeType: 'section', scopeRefId: component.sectionId,
      before: { status: 'draft' }, after: { status: 'cancelled', name: component.name },
      reason: input.reason.trim(),
    }, tx);
    return Ok({ id: input.id });
  }), 'That assessment could not be cancelled.');
}

/* ------------------------------------------------------------------ marks -- */

/**
 * Records when a component was held. The roster is taken as of this date, so it
 * can move only while no mark exists; the database freezes it after that.
 */
export async function recordHeldOn(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: { id: string; version: number; heldOn: string; actingAs: ActingAs },
): Promise<Result<{ version: number }>> {
  const today = todayIso(deps.clock);
  if (input.heldOn > today) {
    return Err(fail('VALIDATION_FAILED',
      'An assessment is recorded once it has been held, not before.', {
        fieldErrors: { heldOn: 'In the future' },
      }));
  }

  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, input.id);
    if (!component) return Err(fail('NOT_FOUND', 'That assessment was not found.'));

    const denied = await outOfReach(deps, actor, tx, input.actingAs, component.offeringId);
    if (denied) return Err(denied);

    if (component.status !== 'draft') {
      return Err(fail('CONFLICT', `This assessment is ${component.status}, so its date is fixed.`));
    }
    if (component.version !== input.version) return Err(stale());

    const set = await deps.components.setHeldOn(tx, {
      id: input.id, heldOn: input.heldOn, expectedVersion: input.version,
    });
    if (!set) return Err(stale());

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.held_on_recorded', subjectType: 'assessment_component',
      subjectId: input.id, scopeType: 'section', scopeRefId: component.sectionId,
      before: { heldOn: component.heldOn }, after: { heldOn: input.heldOn },
    }, tx);
    return Ok({ version: input.version + 1 });
  }), 'That date could not be recorded.');
}

/**
 * Records a batch of marks. One transaction and one version bump: sixty marks
 * land together or not at all, and a stale version is refused so two people on
 * one sheet cannot silently overwrite each other (AD-52's rule).
 */
export async function enterMarks(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: {
    id: string;
    version: number;
    marks: ReadonlyArray<{
      studentId: string; status: MarkStatus; score: number | null; note?: string | null;
    }>;
    actingAs: ActingAs;
  },
): Promise<Result<{ version: number; marked: number }>> {
  if (input.marks.length === 0) {
    return Err(fail('VALIDATION_FAILED', 'Nothing to record.', {
      fieldErrors: { marks: 'At least one student' },
    }));
  }
  const shape = validateMarkShapes(input.marks);
  if (shape) return Err(shape);

  const at = deps.clock.now();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, input.id);
    if (!component) return Err(fail('NOT_FOUND', 'That assessment was not found.'));

    const denied = await outOfReach(deps, actor, tx, input.actingAs, component.offeringId);
    if (denied) return Err(denied);

    if (component.status === 'cancelled') {
      return Err(fail('CONFLICT', 'That assessment was cancelled, so it takes no marks.'));
    }
    if (component.status !== 'draft') {
      return Err(fail('CONFLICT',
        'This assessment has been submitted. A mark changes only by correction, which is recorded.'));
    }
    if (!component.heldOn) {
      return Err(fail('CONFLICT', 'Record when this assessment was held before entering marks.'));
    }

    // Said here in words; the database refuses the same row regardless.
    const over = input.marks.find(
      (m) => m.status === 'scored' && m.score !== null && m.score > component.maxMarks,
    );
    if (over) {
      return Err(fail('VALIDATION_FAILED',
        `A score of ${over.score} is more than the ${component.maxMarks} this assessment is out of.`));
    }

    if (component.version !== input.version) return Err(stale());
    const claimed = await deps.components.touch(tx, {
      id: input.id, expectedVersion: input.version,
    });
    if (!claimed) return Err(stale());

    await deps.marks.upsertMany(tx, {
      componentId: input.id, tenantId: actor.tenantId, markedBy: actor.personId, at,
      marks: input.marks.map((m) => ({
        id: deps.ids.next(), studentId: m.studentId, status: m.status,
        score: m.status === 'scored' ? m.score : null, note: m.note?.trim() || null,
      })),
    });

    // One entry for the batch, with its shape. Notes are left out: they can
    // carry medical detail that has no place in an audit log.
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.marked', subjectType: 'assessment_component', subjectId: input.id,
      scopeType: 'section', scopeRefId: component.sectionId,
      after: {
        course: component.courseCode, name: component.name,
        marked: input.marks.length, counts: countStatuses(input.marks),
        recordedBy: input.actingAs,
      },
    }, tx);

    return Ok({ version: input.version + 1, marked: input.marks.length });
  }), 'Those marks could not be recorded.');
}

/**
 * Submits a sheet: the teacher's statement of the results. Every student on
 * the roster as of the day it was held must have a result, because a sheet
 * with gaps is an unfinished statement rather than a statement.
 */
export async function submitSheet(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: { id: string; version: number; actingAs: ActingAs },
): Promise<Result<{ submitted: true }>> {
  const at = deps.clock.now();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, input.id);
    if (!component) return Err(fail('NOT_FOUND', 'That assessment was not found.'));

    const denied = await outOfReach(deps, actor, tx, input.actingAs, component.offeringId);
    if (denied) return Err(denied);

    if (component.status !== 'draft') {
      return Err(fail('CONFLICT', `This assessment is already ${component.status}.`));
    }
    if (!component.heldOn) {
      return Err(fail('CONFLICT', 'Record when this assessment was held before submitting it.'));
    }
    if (component.version !== input.version) return Err(stale());

    const roster = await deps.enrolments.rosterAsOf(tx, component.offeringId, component.heldOn);
    const marked = new Set((await deps.marks.listForComponent(tx, input.id)).map((m) => m.studentId));
    const missing = roster.filter((r) => !marked.has(r.studentId)).length;
    if (missing > 0) {
      return Err(fail('CONFLICT',
        `${missing} ${missing === 1 ? 'student has' : 'students have'} no result yet. Every student needs one before you submit.`));
    }

    const submitted = await deps.components.submit(tx, {
      id: input.id, by: actor.personId, at, expectedVersion: input.version,
    });
    if (!submitted) return Err(stale());

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.submitted', subjectType: 'assessment_component', subjectId: input.id,
      scopeType: 'section', scopeRefId: component.sectionId,
      before: { status: 'draft' },
      after: {
        status: 'submitted', course: component.courseCode, name: component.name,
        students: roster.length, recordedBy: input.actingAs,
      },
    }, tx);
    return Ok({ submitted: true as const });
  }), 'That sheet could not be submitted.');
}

/**
 * The head of department accepts a submitted sheet. A permission-gated
 * transition rather than an approval workflow, because the approvals
 * capability P1 does not exist yet; when it does, this becomes its step.
 */
export async function verifySheet(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: { id: string; version: number },
): Promise<Result<{ verified: true }>> {
  const at = deps.clock.now();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const component = await deps.components.findById(tx, input.id);
    if (!component) return Err(fail('NOT_FOUND', 'That assessment was not found.'));
    if (component.status === 'verified') {
      return Err(fail('CONFLICT', 'This sheet has already been verified.'));
    }
    if (component.status !== 'submitted') {
      return Err(fail('CONFLICT', 'Only a submitted sheet can be verified.'));
    }
    if (component.version !== input.version) return Err(stale());

    const verified = await deps.components.verify(tx, {
      id: input.id, by: actor.personId, at, expectedVersion: input.version,
    });
    if (!verified) return Err(stale());

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.verified', subjectType: 'assessment_component', subjectId: input.id,
      scopeType: 'section', scopeRefId: component.sectionId,
      before: { status: 'submitted' },
      after: { status: 'verified', course: component.courseCode, name: component.name },
    }, tx);
    return Ok({ verified: true as const });
  }), 'That sheet could not be verified.');
}

/**
 * Corrects one mark on a submitted or verified sheet. The correction row is the
 * mechanism: inserting it is what changes the mark, so it cannot be skipped.
 */
export async function correctMark(
  deps: AssessmentDeps,
  actor: AssessmentActor,
  input: { markId: string; toStatus: MarkStatus; toScore: number | null; reason: string },
): Promise<Result<{
  from: { status: MarkStatus; score: number | null };
  to: { status: MarkStatus; score: number | null };
}>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. A changed mark needs one.', {
      fieldErrors: { reason: 'Required' },
    }));
  }
  const shape = validateMarkShapes([{ status: input.toStatus, score: input.toScore }]);
  if (shape) return Err(shape);
  const toScore = input.toStatus === 'scored' ? input.toScore : null;

  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const mark = await deps.marks.findById(tx, input.markId);
    if (!mark) return Err(fail('NOT_FOUND', 'That mark was not found.'));

    const component = await deps.components.findById(tx, mark.componentId);
    if (component && toScore !== null && toScore > component.maxMarks) {
      return Err(fail('VALIDATION_FAILED',
        `A score of ${toScore} is more than the ${component.maxMarks} this assessment is out of.`));
    }
    if (mark.status === input.toStatus && mark.score === toScore) {
      return Err(fail('CONFLICT', 'That mark already says exactly that.'));
    }

    await deps.marks.correct(tx, {
      id: deps.ids.next(), tenantId: actor.tenantId, markId: input.markId,
      fromStatus: mark.status, fromScore: mark.score,
      toStatus: input.toStatus, toScore,
      reason: input.reason.trim(), correctedBy: actor.personId,
    });

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'assessment.corrected', subjectType: 'assessment_mark', subjectId: input.markId,
      scopeType: 'section', scopeRefId: mark.sectionId,
      before: { status: mark.status, score: mark.score },
      after: { status: input.toStatus, score: toScore, studentId: mark.studentId },
      reason: input.reason.trim(),
    }, tx);

    return Ok({
      from: { status: mark.status, score: mark.score },
      to: { status: input.toStatus, score: toScore },
    });
  }), 'That mark could not be corrected.');
}

/* ---------------------------------------------------------------- helpers -- */

function validatePlan(input: { name: string; maxMarks: number; weight: number }): Failure | null {
  if (!input.name?.trim()) {
    return fail('VALIDATION_FAILED', 'Name the assessment.', { fieldErrors: { name: 'Required' } });
  }
  if (!(input.maxMarks > 0) || !twoDecimals(input.maxMarks)) {
    return fail('VALIDATION_FAILED', 'Maximum marks must be positive, to at most two decimal places.', {
      fieldErrors: { maxMarks: 'Invalid' },
    });
  }
  if (!(input.weight > 0 && input.weight <= 100) || !twoDecimals(input.weight)) {
    return fail('VALIDATION_FAILED', 'A weight is a percentage above 0 and at most 100.', {
      fieldErrors: { weight: 'Invalid' },
    });
  }
  return null;
}

function validateMarkShapes(
  marks: ReadonlyArray<{ status: MarkStatus; score: number | null }>,
): Failure | null {
  for (const mark of marks) {
    if (mark.status === 'scored') {
      if (mark.score === null || !(mark.score >= 0) || !twoDecimals(mark.score)) {
        return fail('VALIDATION_FAILED',
          'A scored mark needs a score of zero or more, to at most two decimal places.', {
            fieldErrors: { score: 'Invalid' },
          });
      }
    } else if (mark.score !== null) {
      // Absent is not zero. A score beside "absent" would be a contradiction
      // the record should never have to explain.
      return fail('VALIDATION_FAILED', `An ${mark.status} mark has no score.`, {
        fieldErrors: { score: 'Must be empty' },
      });
    }
  }
  return null;
}

/** AD-40 in one place: the permission said may; this says which course. */
async function outOfReach(
  deps: AssessmentDeps, actor: AssessmentActor, tx: Tx, actingAs: ActingAs, offeringId: string,
): Promise<Failure | null> {
  if (actingAs === 'administer') return null;
  if (await deps.reach.teachesOffering(tx, offeringId, actor.personId)) return null;
  return fail('FORBIDDEN',
    'You are not assigned to teach this course, so you cannot record its marks.');
}

const stale = () => fail('CONFLICT',
  'Somebody else changed this assessment while you had it open. Open it again so their changes are not lost.');

const countStatuses = (
  marks: ReadonlyArray<{ status: MarkStatus }>,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const mark of marks) counts[mark.status] = (counts[mark.status] ?? 0) + 1;
  return counts;
};

/**
 * Database refusals reach the user as the database wrote them. A named unique
 * constraint gets the caller's sentence; a trigger's own sentence, which names
 * the score, the maximum or the date, is kept.
 */
async function attempt<T>(
  run: () => Promise<Result<T>>, onUniqueViolation: string,
): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof AppException) {
      if (e.code === 'CONFLICT' && violatedConstraint(e) !== null) {
        return Err(fail('CONFLICT', onUniqueViolation));
      }
      return Err(fail(e.code, e.message));
    }
    throw e;
  }
}

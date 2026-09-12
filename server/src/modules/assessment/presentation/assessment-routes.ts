import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope, type Scope } from '../../identity/domain/scope.ts';
import {
  cancelComponent, correctMark, enterMarks, listComponents, myComponents, planComponent,
  readComponent, readSheet, recordHeldOn, reviseComponent, submitSheet, verifySheet, weightTotal,
  type ActingAs, type AssessmentActor, type SheetView,
} from '../application/manage-assessment.ts';
import type { ComponentKind, ComponentRecord, MarkStatus } from '../application/ports.ts';

const KINDS = ['test', 'quiz', 'assignment', 'lab', 'project', 'viva', 'other'] as const;
const STATUSES = ['scored', 'absent', 'exempt'] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const planBody = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(KINDS).default('test'),
  max_marks: z.number().positive().max(1000),
  weight: z.number().positive().max(100),
});
const reviseBody = planBody.extend({ version: z.number().int().min(1) });
const cancelBody = z.object({ version: z.number().int().min(1), reason: z.string().min(1).max(500) });
const heldOnBody = z.object({ version: z.number().int().min(1), held_on: isoDate });
const marksBody = z.object({
  version: z.number().int().min(1),
  marks: z.array(z.object({
    student_id: z.string().uuid(),
    status: z.enum(STATUSES),
    score: z.number().min(0).max(1000).nullable().optional(),
    note: z.string().max(280).nullable().optional(),
  })).min(1).max(500),
});
const versionBody = z.object({ version: z.number().int().min(1) });
const correctBody = z.object({
  status: z.enum(STATUSES),
  score: z.number().min(0).max(1000).nullable().optional(),
  reason: z.string().min(1).max(500),
});

export async function registerAssessmentRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): AssessmentActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  const signedIn = (req: { actor?: { actorType: string; tenantId: string | null } }) =>
    Boolean(req.actor && req.actor.actorType === 'person' && req.actor.tenantId);

  /**
   * Authority for one course, resolved from the course rather than from
   * anything the client sent. Evaluated against the course's own cohort, so an
   * institution-wide, a department-wide and a section grant all answer through
   * one check. Acting administratively is decided by scope breadth (AD-53).
   */
  async function authorise(
    req: never, reply: never, permission: string, sectionId: string,
  ): Promise<{ actingAs: ActingAs } | null> {
    const request = req as unknown as { actor?: { sub: string; tenantId: string | null; actorType: string } };
    if (!signedIn(request)) {
      sendFailure(reply as never, fail('UNAUTHENTICATED', 'Sign in to continue.'));
      return null;
    }
    const authority = await c.authority.authorityFor(request.actor!.tenantId!, request.actor!.sub);
    const wide = await c.authority.can(authority, permission, institutionScope());
    const section: Scope = { type: 'section', refId: sectionId };
    if (!wide && !(await c.authority.can(authority, permission, section))) {
      sendFailure(reply as never, fail('FORBIDDEN', 'You do not have access to do that.'));
      return null;
    }
    return { actingAs: wide ? 'administer' : 'teach' };
  }

  /** Reads the component first, because its cohort is what authority is checked against. */
  async function componentFor(req: { params: unknown; actor?: { tenantId: string | null } }, reply: never) {
    if (!signedIn(req as never)) {
      sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
      return null;
    }
    const component = await readComponent(c.assessment, actorOf(req as never), (req.params as { id: string }).id);
    if (!component) {
      sendFailure(reply, fail('NOT_FOUND', 'That assessment was not found.'));
      return null;
    }
    return component;
  }

  /* ------------------------------------------------------ plan, per course */

  app.get('/offerings/:id/assessments', async (req, reply) => {
    if (!signedIn(req)) return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    const offeringId = (req.params as { id: string }).id;
    const offering = await c.assessment.uow.run(req.actor!.tenantId!, (tx) =>
      c.assessment.offerings.findById(tx, offeringId));
    if (!offering) return sendFailure(reply, fail('NOT_FOUND', 'That course was not found.'));
    if (!(await authorise(req as never, reply as never, 'assessment.read', offering.sectionId))) return reply;

    const [components, total] = await Promise.all([
      listComponents(c.assessment, actorOf(req), { offeringId }),
      weightTotal(c.assessment, actorOf(req), offeringId),
    ]);
    return sendOk(reply, {
      // What is left to allocate, so a form can say so rather than failing.
      weight_total: total,
      weight_remaining: Math.max(0, Math.round((100 - total) * 100) / 100),
      components: components.map(serialiseComponent),
    });
  });

  app.post('/offerings/:id/assessments', async (req, reply) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    if (!signedIn(req)) return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));

    const offeringId = (req.params as { id: string }).id;
    const offering = await c.assessment.uow.run(req.actor!.tenantId!, (tx) =>
      c.assessment.offerings.findById(tx, offeringId));
    if (!offering) return sendFailure(reply, fail('NOT_FOUND', 'That course was not found.'));
    // The plan is departmental, so no teaching reach is involved.
    if (!(await authorise(req as never, reply as never, 'assessment.plan', offering.sectionId))) return reply;

    return sendResult(reply, await planComponent(c.assessment, actorOf(req), {
      offeringId, name: parsed.data.name, kind: parsed.data.kind as ComponentKind,
      maxMarks: parsed.data.max_marks, weight: parsed.data.weight,
    }), 201);
  });

  app.patch('/assessments/:id', async (req, reply) => {
    const parsed = reviseBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    if (!(await authorise(req as never, reply as never, 'assessment.plan', component.sectionId))) return reply;

    return sendResult(reply, await reviseComponent(c.assessment, actorOf(req), {
      id: component.id, version: parsed.data.version, name: parsed.data.name,
      kind: parsed.data.kind as ComponentKind, maxMarks: parsed.data.max_marks,
      weight: parsed.data.weight,
    }));
  });

  app.post('/assessments/:id/cancel', async (req, reply) => {
    const parsed = cancelBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    if (!(await authorise(req as never, reply as never, 'assessment.plan', component.sectionId))) return reply;

    return sendResult(reply, await cancelComponent(c.assessment, actorOf(req), {
      id: component.id, version: parsed.data.version, reason: parsed.data.reason,
    }));
  });

  /* ------------------------------------------------------------- the sheet */

  app.get('/assessments/:id/sheet', async (req, reply) => {
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    if (!(await authorise(req as never, reply as never, 'assessment.read', component.sectionId))) return reply;

    const view = await readSheet(c.assessment, actorOf(req), component.id);
    if (!view) return sendFailure(reply, fail('NOT_FOUND', 'That assessment was not found.'));

    // Stated by the server so neither client reimplements the rules. Marking
    // and submitting also need teaching reach, which a sheet a teacher can read
    // but does not teach will not have; the server re-checks on every write.
    const authority = await c.authority.authorityFor(req.actor!.tenantId!, req.actor!.sub);
    const scope: Scope = { type: 'section', refId: component.sectionId };
    const can = async (permission: string) =>
      (await c.authority.can(authority, permission, institutionScope()))
      || c.authority.can(authority, permission, scope);
    const draft = component.status === 'draft';
    const closed = component.status === 'submitted' || component.status === 'verified';

    return sendOk(reply, {
      ...serialiseSheet(view),
      can_plan: draft && (await can('assessment.plan')),
      can_mark: draft && (await can('assessment.mark')),
      can_submit: draft && (await can('assessment.submit')),
      can_verify: component.status === 'submitted' && (await can('assessment.verify')),
      can_correct: closed && (await can('assessment.correct')),
    });
  });

  app.post('/assessments/:id/held-on', { config: { idempotent: true } }, async (req, reply) => {
    const parsed = heldOnBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    const allowed = await authorise(req as never, reply as never, 'assessment.mark', component.sectionId);
    if (!allowed) return reply;

    return sendResult(reply, await recordHeldOn(c.assessment, actorOf(req), {
      id: component.id, version: parsed.data.version, heldOn: parsed.data.held_on,
      actingAs: allowed.actingAs,
    }));
  });

  app.put('/assessments/:id/marks', { config: { idempotent: true } }, async (req, reply) => {
    const parsed = marksBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    const allowed = await authorise(req as never, reply as never, 'assessment.mark', component.sectionId);
    if (!allowed) return reply;

    return sendResult(reply, await enterMarks(c.assessment, actorOf(req), {
      id: component.id,
      version: parsed.data.version,
      marks: parsed.data.marks.map((m) => ({
        studentId: m.student_id, status: m.status as MarkStatus,
        score: m.score ?? null, note: m.note ?? null,
      })),
      actingAs: allowed.actingAs,
    }));
  });

  app.post('/assessments/:id/submit', { config: { idempotent: true } }, async (req, reply) => {
    const parsed = versionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    const allowed = await authorise(req as never, reply as never, 'assessment.submit', component.sectionId);
    if (!allowed) return reply;

    return sendResult(reply, await submitSheet(c.assessment, actorOf(req), {
      id: component.id, version: parsed.data.version, actingAs: allowed.actingAs,
    }));
  });

  app.post('/assessments/:id/verify', async (req, reply) => {
    const parsed = versionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const component = await componentFor(req, reply as never);
    if (!component) return reply;
    if (!(await authorise(req as never, reply as never, 'assessment.verify', component.sectionId))) return reply;

    return sendResult(reply, await verifySheet(c.assessment, actorOf(req), {
      id: component.id, version: parsed.data.version,
    }));
  });

  /**
   * Faculty deliberately do not hold this. Blueprint 2 D5 puts correction of a
   * submitted sheet with the department, as AD-53 does for attendance.
   */
  app.post('/assessment-marks/:id/correct', async (req, reply) => {
    const parsed = correctBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    if (!signedIn(req)) return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));

    const markId = (req.params as { id: string }).id;
    const mark = await c.assessment.uow.run(req.actor!.tenantId!, (tx) =>
      c.assessment.marks.findById(tx, markId));
    if (!mark) return sendFailure(reply, fail('NOT_FOUND', 'That mark was not found.'));
    if (!(await authorise(req as never, reply as never, 'assessment.correct', mark.sectionId))) return reply;

    return sendResult(reply, await correctMark(c.assessment, actorOf(req), {
      markId, toStatus: parsed.data.status as MarkStatus,
      toScore: parsed.data.score ?? null, reason: parsed.data.reason,
    }));
  });

  /* ------------------------------------------------------------ the queues */

  /**
   * Submitted sheets awaiting verification, for whoever may verify them.
   *
   * A head of department's authority is department-wide, not institution-wide,
   * so the queue is filtered sheet by sheet against each sheet's own cohort
   * rather than refused outright. Ancestry is resolved once per cohort.
   */
  app.get('/assessments', async (req, reply) => {
    if (!signedIn(req)) return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    const authority = await c.authority.authorityFor(req.actor!.tenantId!, req.actor!.sub);
    if (!c.authority.permissions(authority).has('assessment.verify')) {
      return sendFailure(reply, fail('FORBIDDEN', 'You do not have access to do that.'));
    }

    const status = ((req.query as { status?: string }).status ?? 'submitted') as ComponentRecord['status'];
    const components = await listComponents(c.assessment, actorOf(req), { status });

    const reachable = new Map<string, boolean>();
    for (const sectionId of new Set(components.map((x) => x.sectionId))) {
      reachable.set(sectionId, await c.authority.can(
        authority, 'assessment.verify', { type: 'section', refId: sectionId },
      ));
    }
    return sendOk(reply, components
      .filter((x) => reachable.get(x.sectionId))
      .map(serialiseComponent));
  });

  /**
   * The signed-in teacher's own components, across every course they teach.
   * No permission beyond being signed in, exactly as `/me/teaching`: the set is
   * derived from the token subject and nothing the client sends can widen it.
   */
  app.get('/me/assessments', async (req, reply) => {
    if (!signedIn(req)) return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    const rows = await myComponents(c.assessment, actorOf(req));
    return sendOk(reply, rows.map(serialiseComponent));
  });
}

function serialiseComponent(x: ComponentRecord) {
  return {
    id: x.id,
    offering_id: x.offeringId,
    name: x.name,
    kind: x.kind,
    max_marks: x.maxMarks,
    weight: x.weight,
    held_on: x.heldOn,
    status: x.status,
    submitted_at: x.submittedAt,
    submitted_by: x.submittedByName,
    verified_at: x.verifiedAt,
    verified_by: x.verifiedByName,
    cancelled_reason: x.cancelledReason,
    version: x.version,
    mark_count: x.markCount,
    course: { code: x.courseCode, title: x.courseTitle },
    section: { id: x.sectionId, label: x.sectionLabel },
    program_name: x.programName,
    term: { id: x.termId, name: x.termName },
    teacher: x.teacherName,
  };
}

function serialiseSheet(view: SheetView) {
  const counts = { scored: 0, absent: 0, exempt: 0 };
  for (const entry of view.students) if (entry.mark) counts[entry.mark.status]++;
  const marked = counts.scored + counts.absent + counts.exempt;

  return {
    component: serialiseComponent(view.component),
    // Without a date there is no roster, because who was expected depends on it.
    needs_date: view.component.heldOn === null,
    students: view.students.map((entry) => ({
      student_id: entry.studentId,
      full_name: entry.fullName,
      enrolment_number: entry.enrolmentNumber,
      student_status: entry.studentStatus,
      // Null means nobody has recorded a result, which is not absent.
      mark_id: entry.mark?.id ?? null,
      status: entry.mark?.status ?? null,
      score: entry.mark?.score ?? null,
      note: entry.mark?.note ?? null,
      marked_by: entry.mark?.markedByName ?? null,
      marked_at: entry.mark?.markedAt ?? null,
    })),
    corrections: view.corrections.map((k) => ({
      id: k.id,
      mark_id: k.markId,
      student_name: k.studentName,
      from_status: k.fromStatus,
      from_score: k.fromScore,
      to_status: k.toStatus,
      to_score: k.toScore,
      reason: k.reason,
      corrected_by: k.correctedByName,
      corrected_at: k.correctedAt,
    })),
    summary: { ...counts, marked, unmarked: view.students.length - marked, total: view.students.length },
  };
}

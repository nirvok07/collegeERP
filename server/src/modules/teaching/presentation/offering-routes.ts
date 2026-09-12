import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  assignInstructor, createOffering, endInstructorAssignment, listOfferings,
  myTeaching, offeringHistory, readOffering, transitionOffering,
  type OfferingActor,
} from '../application/manage-offerings.ts';
import type { OfferingComponent, OfferingRecord, OfferingStatus } from '../application/ports.ts';

const offeringBody = z.object({
  section_id: z.string().uuid(),
  course_id: z.string().uuid(),
  component: z.enum(['lecture', 'lab', 'tutorial']).default('lecture'),
});
const statusBody = z.object({
  status: z.enum(['planned', 'active', 'completed', 'cancelled']),
  reason: z.string().max(500).optional(),
});
const assignBody = z.object({
  person_id: z.string().uuid(),
  role: z.enum(['lead', 'co', 'assistant']).default('lead'),
});
const endBody = z.object({ reason: z.string().min(1).max(500) });

export async function registerOfferingRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): OfferingActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  const canRead = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'offering.read', institutionScope());
  const canManage = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'offering.manage', institutionScope());
  const canAssign = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'instructor.assign', institutionScope());

  /**
   * What the signed-in person teaches.
   *
   * Needs no permission beyond being authenticated: reading your own teaching
   * is self-scoped. The set is derived from the token's subject and never from
   * anything the client sends, which is the whole point of a separate endpoint
   * rather than a filter the caller could widen.
   */
  app.get('/me/teaching', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const termId = (req.query as { term_id?: string }).term_id ?? null;
    const rows = await myTeaching(c.offerings, actorOf(req), { termId });
    return sendOk(reply, rows.map((o) => ({
      ...serialise(o),
      // Which role the reader holds here, so a mobile client does not have to
      // scan the instructor list to find itself.
      my_role: o.instructors.find((i) => i.personId === req.actor!.sub)?.role ?? null,
    })));
  });

  app.get('/offerings', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as Record<string, string | undefined>;
    const rows = await listOfferings(c.offerings, actorOf(req), {
      sectionId: q.section_id ?? null,
      courseId: q.course_id ?? null,
      termId: q.term_id ?? null,
      programId: q.program_id ?? null,
      status: (q.status as OfferingStatus | undefined) ?? null,
      instructorPersonId: q.instructor_id ?? null,
      unstaffedOnly: q.unstaffed === 'true',
    });
    return sendOk(reply, rows.map(serialise));
  });

  app.get('/offerings/:id', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const offering = await readOffering(c.offerings, actorOf(req), (req.params as { id: string }).id);
    if (!offering) return sendFailure(reply, fail('NOT_FOUND', 'That offering was not found.'));
    return sendOk(reply, serialise(offering));
  });

  /** Every assignment ever, so a mid-term handover stays explicable. */
  app.get('/offerings/:id/instructor-history', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const rows = await offeringHistory(c.offerings, actorOf(req), (req.params as { id: string }).id);
    return sendOk(reply, rows.map((a) => ({
      id: a.id, person_id: a.personId, full_name: a.fullName, role: a.role,
      valid_from: a.validFrom, valid_to: a.validTo, end_reason: a.endReason,
      is_current: a.validTo === null,
    })));
  });

  app.post('/offerings', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = offeringBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createOffering(c.offerings, actorOf(req), {
      sectionId: parsed.data.section_id,
      courseId: parsed.data.course_id,
      component: parsed.data.component as OfferingComponent,
    }), 201);
  });

  app.post('/offerings/:id/status', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await transitionOffering(c.offerings, actorOf(req), {
      id: (req.params as { id: string }).id,
      to: parsed.data.status,
      reason: parsed.data.reason ?? null,
    }));
  });

  app.post('/offerings/:id/instructors', async (req, reply) => {
    if (!(await canAssign(req as never, reply as never))) return reply;
    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await assignInstructor(c.offerings, actorOf(req), {
      offeringId: (req.params as { id: string }).id,
      personId: parsed.data.person_id,
      role: parsed.data.role,
    }), 201);
  });

  app.post('/instructor-assignments/:id/end', async (req, reply) => {
    if (!(await canAssign(req as never, reply as never))) return reply;
    const parsed = endBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await endInstructorAssignment(c.offerings, actorOf(req), {
      assignmentId: (req.params as { id: string }).id,
      reason: parsed.data.reason,
    }));
  });
}

function serialise(o: OfferingRecord) {
  return {
    id: o.id,
    component: o.component,
    status: o.status,
    cancelled_reason: o.cancelledReason,
    course: { id: o.courseId, code: o.courseCode, title: o.courseTitle },
    section: {
      id: o.sectionId, label: o.sectionLabel, status: o.sectionStatus,
      term_number: o.termNumber,
    },
    program: { id: o.programId, name: o.programName },
    department_name: o.departmentName,
    term: { id: o.termId, name: o.termName },
    academic_year_name: o.academicYearName,
    instructors: o.instructors.map((i) => ({
      assignment_id: i.assignmentId, person_id: i.personId,
      full_name: i.fullName, role: i.role, since: i.validFrom,
    })),
    // Stated by the server so no client reimplements the lifecycle to draw a
    // button, and so neither client can offer a transition the trigger refuses.
    allowed_transitions: {
      planned: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    }[o.status],
    // An offering cannot start unstaffed: attendance is recorded against
    // whoever is teaching.
    can_activate: o.status === 'planned'
      && o.sectionStatus === 'active'
      && o.instructors.length > 0,
  };
}

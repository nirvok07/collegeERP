import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  createAcademicYear, createSection, createTerm, listAcademicYears, listSections,
  listTerms, readSection, setSectionCapacity, transitionSection, type TeachingActor,
} from '../application/manage-sections.ts';
import type { SectionStatus } from '../application/ports.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const yearBody = z.object({
  name: z.string().min(2).max(40),
  starts_on: isoDate,
  ends_on: isoDate,
  make_current: z.boolean().default(false),
});
const termBody = z.object({
  academic_year_id: z.string().uuid(),
  sequence: z.number().int().positive().max(6),
  name: z.string().min(1).max(40),
  starts_on: isoDate,
  ends_on: isoDate,
});
const sectionBody = z.object({
  program_id: z.string().uuid(),
  term_id: z.string().uuid(),
  term_number: z.number().int().positive().max(20),
  label: z.string().min(1).max(12),
  capacity: z.number().int().positive().max(1000).nullable().optional(),
});
const transitionBody = z.object({
  status: z.enum(['planned', 'open', 'active', 'completed', 'cancelled']),
  reason: z.string().max(500).optional(),
});
const capacityBody = z.object({ capacity: z.number().int().positive().max(1000).nullable() });

export async function registerTeachingRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): TeachingActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  const canReadSections = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'section.read', institutionScope());
  const canManageSections = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'section.manage', institutionScope());
  const canManageCalendar = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'term.manage', institutionScope());

  /* ------------------------------------------------------- academic period */

  app.get('/academic-years', async (req, reply) => {
    if (!(await canReadSections(req as never, reply as never))) return reply;
    const rows = await listAcademicYears(c.teaching, actorOf(req));
    return sendOk(reply, rows.map((y) => ({
      id: y.id, name: y.name, starts_on: y.startsOn, ends_on: y.endsOn,
      is_current: y.isCurrent, status: y.status, term_count: y.termCount,
    })));
  });

  app.post('/academic-years', async (req, reply) => {
    if (!(await canManageCalendar(req as never, reply as never))) return reply;
    const parsed = yearBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createAcademicYear(c.teaching, actorOf(req), {
      name: parsed.data.name,
      startsOn: parsed.data.starts_on,
      endsOn: parsed.data.ends_on,
      makeCurrent: parsed.data.make_current,
    }), 201);
  });

  app.get('/terms', async (req, reply) => {
    if (!(await canReadSections(req as never, reply as never))) return reply;
    const yearId = (req.query as { academic_year_id?: string }).academic_year_id ?? null;
    const rows = await listTerms(c.teaching, actorOf(req), yearId);
    return sendOk(reply, rows.map((t) => ({
      id: t.id, academic_year_id: t.academicYearId, academic_year_name: t.academicYearName,
      sequence: t.sequence, name: t.name, starts_on: t.startsOn, ends_on: t.endsOn,
      status: t.status,
    })));
  });

  app.post('/terms', async (req, reply) => {
    if (!(await canManageCalendar(req as never, reply as never))) return reply;
    const parsed = termBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createTerm(c.teaching, actorOf(req), {
      academicYearId: parsed.data.academic_year_id,
      sequence: parsed.data.sequence,
      name: parsed.data.name,
      startsOn: parsed.data.starts_on,
      endsOn: parsed.data.ends_on,
    }), 201);
  });

  /* ---------------------------------------------------------------- sections */

  app.get('/sections', async (req, reply) => {
    if (!(await canReadSections(req as never, reply as never))) return reply;
    const q = req.query as Record<string, string | undefined>;
    const rows = await listSections(c.teaching, actorOf(req), {
      academicYearId: q.academic_year_id ?? null,
      termId: q.term_id ?? null,
      programId: q.program_id ?? null,
      status: (q.status as SectionStatus | undefined) ?? null,
    });
    return sendOk(reply, rows.map(serialise));
  });

  app.get('/sections/:id', async (req, reply) => {
    if (!(await canReadSections(req as never, reply as never))) return reply;
    const section = await readSection(c.teaching, actorOf(req), (req.params as { id: string }).id);
    if (!section) return sendFailure(reply, fail('NOT_FOUND', 'That section was not found.'));
    return sendOk(reply, serialise(section));
  });

  app.post('/sections', async (req, reply) => {
    if (!(await canManageSections(req as never, reply as never))) return reply;
    const parsed = sectionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createSection(c.teaching, actorOf(req), {
      programId: parsed.data.program_id,
      termId: parsed.data.term_id,
      termNumber: parsed.data.term_number,
      label: parsed.data.label,
      capacity: parsed.data.capacity ?? null,
    }), 201);
  });

  app.post('/sections/:id/status', async (req, reply) => {
    if (!(await canManageSections(req as never, reply as never))) return reply;
    const parsed = transitionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await transitionSection(c.teaching, actorOf(req), {
      id: (req.params as { id: string }).id,
      to: parsed.data.status,
      reason: parsed.data.reason ?? null,
    }));
  });

  app.patch('/sections/:id/capacity', async (req, reply) => {
    if (!(await canManageSections(req as never, reply as never))) return reply;
    const parsed = capacityBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await setSectionCapacity(c.teaching, actorOf(req), {
      id: (req.params as { id: string }).id,
      capacity: parsed.data.capacity,
    }));
  });
}

function serialise(s: import('../application/ports.ts').SectionRecord) {
  return {
    id: s.id,
    label: s.label,
    status: s.status,
    term_number: s.termNumber,
    capacity: s.capacity,
    cancelled_reason: s.cancelledReason,
    // The whole context on every row, because an operator scanning a section
    // list must never have to click to learn which college part it belongs to.
    program: { id: s.programId, name: s.programName, code: s.programCode },
    department_name: s.departmentName,
    campus_name: s.campusName,
    academic_year: { id: s.academicYearId, name: s.academicYearName },
    term: { id: s.termId, name: s.termName },
    // Stated, so no client has to reimplement the lifecycle to draw a button.
    allowed_transitions: {
      planned: ['open', 'cancelled'],
      open: ['planned', 'active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    }[s.status],
  };
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  admitStudent, dropFromOffering, endPlacement, enrolCohort, enrolInOffering, listStudents,
  membershipHistory, placeInSection, readStudent, roster, setStudentStatus,
  type EnrolmentActor,
} from '../application/manage-students.ts';
import type { RosterEntry, StudentRecord, StudentStatus } from '../application/ports.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const admitBody = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email().max(254).nullable().optional(),
  // OTP-4 (AD-82): where the student's sign-in code can go, with the email.
  phone: z.string().max(20).nullable().optional(),
  enrolment_number: z.string().min(1).max(40),
  program_id: z.string().uuid(),
  admitted_on: isoDate,
});
const statusBody = z.object({
  status: z.enum(['enrolled', 'on_leave', 'withdrawn', 'graduated']),
  reason: z.string().max(500).optional(),
});
const placeBody = z.object({
  student_id: z.string().uuid(),
  from: isoDate.optional(),
});
const endBody = z.object({
  on: isoDate.optional(),
  reason: z.string().min(1).max(500),
});
const enrolBody = z.object({
  student_id: z.string().uuid(),
  from: isoDate.optional(),
});
const cohortBody = z.object({ from: isoDate.optional() });

export async function registerEnrolmentRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): EnrolmentActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  const canRead = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'student.read', institutionScope());
  const canManage = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'student.manage', institutionScope());
  const canEnrol = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'enrolment.manage', institutionScope());

  /* --------------------------------------------------------------- students */

  app.get('/students', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as Record<string, string | undefined>;
    const rows = await listStudents(c.enrolment, actorOf(req), {
      search: q.q?.trim() || null,
      programId: q.program_id ?? null,
      sectionId: q.section_id ?? null,
      status: (q.status as StudentStatus | undefined) ?? null,
      unplacedOnly: q.unplaced === 'true',
      limit: q.limit ? Number(q.limit) : null,
    });
    return sendOk(reply, rows.map(serialiseStudent));
  });

  app.get('/students/:id', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const student = await readStudent(c.enrolment, actorOf(req), (req.params as { id: string }).id);
    if (!student) return sendFailure(reply, fail('NOT_FOUND', 'That student was not found.'));
    return sendOk(reply, serialiseStudent(student));
  });

  /** Every cohort this student has been in, so a mid-term move stays explicable. */
  app.get('/students/:id/placements', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const rows = await membershipHistory(
      c.enrolment, actorOf(req), (req.params as { id: string }).id,
    );
    return sendOk(reply, rows.map((m) => ({
      id: m.id, section_id: m.sectionId, valid_from: m.validFrom,
      valid_to: m.validTo, end_reason: m.endReason, is_current: m.validTo === null,
    })));
  });

  app.post('/students', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = admitBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await admitStudent(c.enrolment, actorOf(req), {
      fullName: parsed.data.full_name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      enrolmentNumber: parsed.data.enrolment_number,
      programId: parsed.data.program_id,
      admittedOn: parsed.data.admitted_on,
    }), 201);
  });

  app.patch('/students/:id/status', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = statusBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await setStudentStatus(c.enrolment, actorOf(req), {
      id: (req.params as { id: string }).id,
      status: parsed.data.status,
      reason: parsed.data.reason ?? null,
    }));
  });

  /* ------------------------------------------------------ cohort placement */

  app.post('/sections/:id/members', async (req, reply) => {
    if (!(await canEnrol(req as never, reply as never))) return reply;
    const parsed = placeBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await placeInSection(c.enrolment, actorOf(req), {
      studentId: parsed.data.student_id,
      sectionId: (req.params as { id: string }).id,
      from: parsed.data.from ?? null,
    }), 201);
  });

  app.post('/sections/:id/members/:studentId/end', async (req, reply) => {
    if (!(await canEnrol(req as never, reply as never))) return reply;
    const parsed = endBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const params = req.params as { id: string; studentId: string };
    return sendResult(reply, await endPlacement(c.enrolment, actorOf(req), {
      studentId: params.studentId,
      sectionId: params.id,
      on: parsed.data.on ?? null,
      reason: parsed.data.reason,
    }));
  });

  /* ------------------------------------------------------ course enrolment */

  /**
   * The roster of a course as it stood on a date.
   *
   * `on` matters: a student who withdrew in week ten was still expected in week
   * three, and reopening week three must show them. It defaults to today only
   * because that is the common case, never because the date is optional to the
   * answer.
   */
  app.get('/offerings/:id/roster', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const on = (req.query as { on?: string }).on ?? new Date().toISOString().slice(0, 10);
    const rows = await roster(c.enrolment, actorOf(req), (req.params as { id: string }).id, on);
    return sendOk(reply, { on, students: rows.map(serialiseRosterEntry) });
  });

  app.post('/offerings/:id/enrolments', async (req, reply) => {
    if (!(await canEnrol(req as never, reply as never))) return reply;
    const parsed = enrolBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await enrolInOffering(c.enrolment, actorOf(req), {
      studentId: parsed.data.student_id,
      offeringId: (req.params as { id: string }).id,
      from: parsed.data.from ?? null,
    }), 201);
  });

  app.post('/offerings/:id/enrolments/cohort', async (req, reply) => {
    if (!(await canEnrol(req as never, reply as never))) return reply;
    const parsed = cohortBody.safeParse(req.body ?? {});
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await enrolCohort(c.enrolment, actorOf(req), {
      offeringId: (req.params as { id: string }).id,
      from: parsed.data.from ?? null,
    }));
  });

  app.post('/offerings/:id/enrolments/:studentId/end', async (req, reply) => {
    if (!(await canEnrol(req as never, reply as never))) return reply;
    const parsed = endBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const params = req.params as { id: string; studentId: string };
    return sendResult(reply, await dropFromOffering(c.enrolment, actorOf(req), {
      studentId: params.studentId,
      offeringId: params.id,
      on: parsed.data.on ?? null,
      reason: parsed.data.reason,
    }));
  });
}

function serialiseStudent(s: StudentRecord) {
  return {
    id: s.id,
    person_id: s.personId,
    full_name: s.fullName,
    email: s.email,
    phone: s.phone,
    enrolment_number: s.enrolmentNumber,
    program: { id: s.programId, name: s.programName },
    admitted_on: s.admittedOn,
    status: s.status,
    status_reason: s.statusReason,
    // The cohort they are in now, or null. An unplaced student is a normal
    // state at the start of a term, not an error.
    section: s.sectionId
      ? { id: s.sectionId, label: s.sectionLabel, term_number: s.sectionTermNumber }
      : null,
  };
}

function serialiseRosterEntry(r: RosterEntry) {
  return {
    student_id: r.studentId,
    person_id: r.personId,
    full_name: r.fullName,
    enrolment_number: r.enrolmentNumber,
    student_status: r.studentStatus,
    enrolled_from: r.enrolledFrom,
    enrolled_to: r.enrolledTo,
  };
}

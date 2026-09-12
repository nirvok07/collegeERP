import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope, type Scope } from '../../identity/domain/scope.ts';
import {
  correctMark, listSessionsForAttendance, markAttendance, readSheet, submitSheet, summariesFor,
  type ActingAs, type AttendanceActor, type SheetView,
} from '../application/manage-attendance.ts';
import type { AttendanceState } from '../application/ports.ts';

const STATES = ['present', 'absent', 'late', 'excused'] as const;

const markBody = z.object({
  // The version the client last read. Two teachers on one register must not
  // silently overwrite each other, and 0 means "no register yet".
  version: z.number().int().min(0),
  marks: z.array(z.object({
    student_id: z.string().uuid(),
    state: z.enum(STATES),
    note: z.string().max(280).nullable().optional(),
  })).min(1).max(500),
});
const submitBody = z.object({ version: z.number().int().min(0) });
const correctBody = z.object({
  state: z.enum(STATES),
  reason: z.string().min(1).max(500),
});

export async function registerAttendanceRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): AttendanceActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  /**
   * Authority for one register, resolved from the class rather than from
   * anything the client sent.
   *
   * The permission is checked against the class's own cohort, so a faculty
   * member granted over section A cannot reach section B whatever their
   * assignments say. An institution-wide grant contains a section scope, so one
   * check serves both an administrator and a teacher.
   *
   * Acting administratively is decided by scope breadth, not by a second
   * permission: holding the permission institution-wide is what lets a
   * coordinator enter a paper register for a teacher who cannot. Anything
   * narrower must be teaching the course, which M3's assignment decides.
   */
  async function authorise(
    req: never, reply: never, permission: string, sectionId: string,
  ): Promise<{ actingAs: ActingAs } | null> {
    const request = req as unknown as {
      actor?: { sub: string; tenantId: string | null; actorType: string };
    };
    if (!request.actor || request.actor.actorType !== 'person' || !request.actor.tenantId) {
      sendFailure(reply as never, fail('UNAUTHENTICATED', 'Sign in to continue.'));
      return null;
    }
    const authority = await c.authority.authorityFor(request.actor.tenantId, request.actor.sub);
    const section: Scope = { type: 'section', refId: sectionId };

    const wide = await c.authority.can(authority, permission, institutionScope());
    const narrow = wide || await c.authority.can(authority, permission, section);
    if (!narrow) {
      sendFailure(reply as never, fail('FORBIDDEN', 'You do not have access to do that.'));
      return null;
    }
    return { actingAs: wide ? 'administer' : 'teach' };
  }

  /* ------------------------------------------------------------- one sheet */

  app.get('/sessions/:id/attendance', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const view = await readSheet(c.attendance, actorOf(req), (req.params as { id: string }).id);
    if (!view) return sendFailure(reply, fail('NOT_FOUND', 'That class was not found.'));

    const read = await authorise(
      req as never, reply as never, 'attendance.read', view.session.sectionId,
    );
    if (!read) return reply;

    // Stated by the server so neither client reimplements the rules to decide
    // which controls to draw.
    const authority = await c.authority.authorityFor(req.actor.tenantId, req.actor.sub);
    const section: Scope = { type: 'section', refId: view.session.sectionId };
    const canMark = await c.authority.can(authority, 'attendance.mark', section);
    const canSubmit = await c.authority.can(authority, 'attendance.submit', section);
    const canCorrect = await c.authority.can(authority, 'attendance.correct', section);

    // Submission is what closes a register, so it is the single condition that
    // decides all three.
    const submitted = view.sheet?.status === 'submitted';
    return sendOk(reply, {
      ...serialiseView(view),
      can_mark: canMark && !submitted,
      can_submit: canSubmit && !submitted,
      can_correct: canCorrect && submitted,
    });
  });

  app.put('/sessions/:id/attendance', async (req, reply) => {
    const parsed = markBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));

    const sessionId = (req.params as { id: string }).id;
    const session = await c.attendance.uow.run(req.actor!.tenantId!, (tx) =>
      c.attendance.sessions.findById(tx, sessionId));
    if (!session) return sendFailure(reply, fail('NOT_FOUND', 'That class was not found.'));

    const allowed = await authorise(
      req as never, reply as never, 'attendance.mark', session.sectionId,
    );
    if (!allowed) return reply;

    return sendResult(reply, await markAttendance(c.attendance, actorOf(req), {
      sessionId,
      version: parsed.data.version,
      marks: parsed.data.marks.map((m) => ({
        studentId: m.student_id, state: m.state as AttendanceState, note: m.note ?? null,
      })),
      actingAs: allowed.actingAs,
    }));
  });

  app.post('/sessions/:id/attendance/submit', async (req, reply) => {
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));

    const sessionId = (req.params as { id: string }).id;
    const session = await c.attendance.uow.run(req.actor!.tenantId!, (tx) =>
      c.attendance.sessions.findById(tx, sessionId));
    if (!session) return sendFailure(reply, fail('NOT_FOUND', 'That class was not found.'));

    const allowed = await authorise(
      req as never, reply as never, 'attendance.submit', session.sectionId,
    );
    if (!allowed) return reply;

    return sendResult(reply, await submitSheet(c.attendance, actorOf(req), {
      sessionId, version: parsed.data.version, actingAs: allowed.actingAs,
    }));
  });

  /**
   * Corrects one mark on a submitted register.
   *
   * Faculty deliberately do not hold this: Blueprint 2 D4 puts the authority
   * with the head of department or class advisor, and the request-and-approve
   * path that would let a teacher ask for a correction needs the approvals
   * capability, which does not exist yet.
   */
  app.post('/attendance-records/:id/correct', async (req, reply) => {
    const parsed = correctBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }

    const recordId = (req.params as { id: string }).id;
    const mark = await c.attendance.uow.run(req.actor.tenantId, (tx) =>
      c.attendance.marks.findById(tx, recordId));
    if (!mark) return sendFailure(reply, fail('NOT_FOUND', 'That mark was not found.'));

    const allowed = await authorise(
      req as never, reply as never, 'attendance.correct', mark.sectionId,
    );
    if (!allowed) return reply;

    return sendResult(reply, await correctMark(c.attendance, actorOf(req), {
      recordId, toState: parsed.data.state as AttendanceState, reason: parsed.data.reason,
    }));
  });

  /* -------------------------------------------------------------- overview */

  /**
   * Every class in a window with the state of its register.
   *
   * One query for the whole range rather than one per row of a screen, and the
   * same shape whether it covers a day or a week.
   */
  app.get('/attendance', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const authority = await c.authority.authorityFor(req.actor.tenantId, req.actor.sub);
    if (!(await c.authority.can(authority, 'attendance.read', institutionScope()))) {
      return sendFailure(reply, fail('FORBIDDEN', 'You do not have access to do that.'));
    }

    const q = req.query as { from?: string; to?: string; section_id?: string };
    const today = new Date().toISOString().slice(0, 10);
    const sessions = await listSessionsForAttendance(c.attendance, actorOf(req), {
      from: q.from ?? today,
      to: q.to ?? today,
      sectionId: q.section_id ?? null,
    });
    const summaries = await summariesFor(
      c.attendance, actorOf(req), sessions.map((s) => s.id),
    );
    const byId = new Map(summaries.map((s) => [s.sessionId, s]));

    return sendOk(reply, sessions.map((session) => {
      const summary = byId.get(session.id);
      return {
        session_id: session.id,
        date: session.sessionDate,
        starts_at: session.startsAt,
        course: { code: session.courseCode, title: session.courseTitle },
        section: { id: session.sectionId, label: session.sectionLabel },
        program_name: session.programName,
        teacher: session.teacherId
          ? { id: session.teacherId, full_name: session.teacherName }
          : null,
        session_status: session.status,
        status: summary?.status ?? 'draft',
        marked: summary?.marked ?? 0,
        counts: {
          present: summary?.present ?? 0,
          absent: summary?.absent ?? 0,
          late: summary?.late ?? 0,
          excused: summary?.excused ?? 0,
        },
        submitted_at: summary?.submittedAt ?? null,
      };
    }));
  });
}

function serialiseView(view: SheetView) {
  const session = view.session;
  return {
    session: {
      id: session.id,
      date: session.sessionDate,
      starts_at: session.startsAt,
      ends_at: session.endsAt,
      status: session.status,
      course: { id: session.courseId, code: session.courseCode, title: session.courseTitle },
      component: session.component,
      section: { id: session.sectionId, label: session.sectionLabel },
      program: { id: session.programId, name: session.programName },
      term: { id: session.termId, name: session.termName },
      room: session.roomId ? { id: session.roomId, code: session.roomCode } : null,
      teacher: session.teacherId
        ? { id: session.teacherId, full_name: session.teacherName }
        : null,
    },
    // Null until somebody marks something: a term of classes does not carry a
    // term of empty registers. Version 0 is what a client sends to open one.
    sheet: view.sheet
      ? {
          status: view.sheet.status,
          version: view.sheet.version,
          submitted_at: view.sheet.submittedAt,
          submitted_by: view.sheet.submittedByName,
        }
      : { status: 'draft' as const, version: 0, submitted_at: null, submitted_by: null },
    students: view.students.map((entry) => ({
      student_id: entry.studentId,
      full_name: entry.fullName,
      enrolment_number: entry.enrolmentNumber,
      student_status: entry.studentStatus,
      // Null means nobody has said anything about this student yet, which is
      // different from being absent.
      state: entry.mark?.state ?? null,
      note: entry.mark?.note ?? null,
      record_id: entry.mark?.id ?? null,
      marked_by: entry.mark?.markedByName ?? null,
      marked_at: entry.mark?.markedAt ?? null,
    })),
    corrections: view.corrections.map((correction) => ({
      id: correction.id,
      record_id: correction.recordId,
      student_name: correction.studentName,
      from_state: correction.fromState,
      to_state: correction.toState,
      reason: correction.reason,
      corrected_by: correction.correctedByName,
      corrected_at: correction.correctedAt,
    })),
    summary: summarise(view),
  };
}

function summarise(view: SheetView) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  let marked = 0;
  for (const entry of view.students) {
    if (!entry.mark) continue;
    marked++;
    counts[entry.mark.state]++;
  }
  return { ...counts, marked, unmarked: view.students.length - marked, total: view.students.length };
}

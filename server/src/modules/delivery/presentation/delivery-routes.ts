import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  addNonTeachingDay, archiveRoom, createRoom, listNonTeachingDays, listRooms, readCalendar,
  removeNonTeachingDay, updateRoom, type DeliveryActor,
} from '../application/manage-rooms.ts';
import {
  addSlot, generateSessions, listSlots, removeSlot,
} from '../application/manage-timetable.ts';
import {
  cancelSession, completeSession, listSessions, mySessions, readSession, reassignSession,
  rescheduleSession, scheduleSession,
} from '../application/manage-sessions.ts';
import type {
  RoomKind, RoomRecord, SessionRecord, SessionStatus, SlotRecord,
} from '../application/ports.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

const roomBody = z.object({
  campus_id: z.string().uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(80),
  kind: z.enum(['classroom', 'lab', 'seminar', 'auditorium']).default('classroom'),
  capacity: z.number().int().positive().max(2000).nullable().optional(),
});
const roomPatch = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(['classroom', 'lab', 'seminar', 'auditorium']),
  capacity: z.number().int().positive().max(2000).nullable().optional(),
});
/** CAL-1: `to_date` closes every day from `on_date` to it, under one label. */
const dayBody = z.object({ on_date: isoDate, to_date: isoDate.optional(), label: z.string().min(1).max(80) });
const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
const slotBody = z.object({
  day_of_week: z.number().int().min(1).max(7),
  starts_at: clockTime,
  ends_at: clockTime,
  room_id: z.string().uuid().nullable().optional(),
});
const generateBody = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  preview: z.boolean().default(false),
});
const sessionBody = z.object({
  offering_id: z.string().uuid(),
  session_date: isoDate,
  starts_at: clockTime,
  ends_at: clockTime,
  room_id: z.string().uuid().nullable().optional(),
  stand_in_person_id: z.string().uuid().nullable().optional(),
});
const rescheduleBody = z.object({
  session_date: isoDate,
  starts_at: clockTime,
  ends_at: clockTime,
  room_id: z.string().uuid().nullable().optional(),
  reason: z.string().max(500).optional(),
});
const cancelBody = z.object({ reason: z.string().min(1).max(500) });
const reassignBody = z.object({
  room_id: z.string().uuid().nullable().optional(),
  stand_in_person_id: z.string().uuid().nullable().optional(),
  reason: z.string().max(500).optional(),
});

export async function registerDeliveryRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): DeliveryActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  const canRead = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'session.read', institutionScope());
  const canManage = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'session.manage', institutionScope());
  const canManageRooms = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'room.manage', institutionScope());
  const canManageCalendar = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'term.manage', institutionScope());

  /* ------------------------------------------------------------------ rooms */

  app.get('/rooms', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as { campus_id?: string; include_archived?: string };
    const rows = await listRooms(c.rooms, actorOf(req), {
      campusId: q.campus_id ?? null,
      includeArchived: q.include_archived === 'true',
    });
    return sendOk(reply, rows.map(serialiseRoom));
  });

  app.post('/rooms', async (req, reply) => {
    if (!(await canManageRooms(req as never, reply as never))) return reply;
    const parsed = roomBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createRoom(c.rooms, actorOf(req), {
      campusId: parsed.data.campus_id,
      code: parsed.data.code,
      name: parsed.data.name,
      kind: parsed.data.kind as RoomKind,
      capacity: parsed.data.capacity ?? null,
    }), 201);
  });

  app.patch('/rooms/:id', async (req, reply) => {
    if (!(await canManageRooms(req as never, reply as never))) return reply;
    const parsed = roomPatch.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await updateRoom(c.rooms, actorOf(req), {
      id: (req.params as { id: string }).id,
      name: parsed.data.name,
      kind: parsed.data.kind as RoomKind,
      capacity: parsed.data.capacity ?? null,
    }));
  });

  app.post('/rooms/:id/archive', async (req, reply) => {
    if (!(await canManageRooms(req as never, reply as never))) return reply;
    return sendResult(reply,
      await archiveRoom(c.rooms, actorOf(req), (req.params as { id: string }).id));
  });

  /* ------------------------------------------------- non-teaching days (M2) */

  app.get('/non-teaching-days', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as { from?: string; to?: string };
    const rows = await listNonTeachingDays(c.rooms, actorOf(req), {
      from: q.from ?? null, to: q.to ?? null,
    });
    return sendOk(reply, rows.map((d) => ({ id: d.id, on_date: d.onDate, label: d.label })));
  });

  app.post('/non-teaching-days', async (req, reply) => {
    if (!(await canManageCalendar(req as never, reply as never))) return reply;
    const parsed = dayBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await addNonTeachingDay(c.rooms, actorOf(req), {
      onDate: parsed.data.on_date, toDate: parsed.data.to_date ?? null, label: parsed.data.label,
    }), 201);
  });

  /**
   * CAL-1: the academic calendar (years, terms, holidays) for anyone signed in
   * to the college, students included. Nothing in it is personal, so it asks
   * only for a college session, not a permission.
   */
  app.get('/calendar', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const parsed = rangeQuery.safeParse(req.query);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const calendar = await readCalendar(c.rooms, actorOf(req), {
      from: parsed.data.from ?? null, to: parsed.data.to ?? null,
    });
    return sendOk(reply, {
      holidays: calendar.holidays.map((d) => ({ id: d.id, on_date: d.onDate, label: d.label })),
      periods: calendar.periods.map((p) => ({
        kind: p.kind, id: p.id, name: p.name, year_name: p.yearName,
        starts_on: p.startsOn, ends_on: p.endsOn, is_current: p.isCurrent,
      })),
    });
  });

  app.delete('/non-teaching-days/:id', async (req, reply) => {
    if (!(await canManageCalendar(req as never, reply as never))) return reply;
    return sendResult(reply,
      await removeNonTeachingDay(c.rooms, actorOf(req), (req.params as { id: string }).id));
  });

  /* -------------------------------------------------------- timetable slots */

  app.get('/slots', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as { offering_id?: string; term_id?: string };
    const rows = await listSlots(c.timetable, actorOf(req), {
      offeringId: q.offering_id ?? null, termId: q.term_id ?? null,
    });
    return sendOk(reply, rows.map(serialiseSlot));
  });

  app.post('/offerings/:id/slots', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = slotBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await addSlot(c.timetable, actorOf(req), {
      offeringId: (req.params as { id: string }).id,
      dayOfWeek: parsed.data.day_of_week,
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      roomId: parsed.data.room_id ?? null,
    }), 201);
  });

  app.delete('/slots/:id', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    return sendResult(reply,
      await removeSlot(c.timetable, actorOf(req), (req.params as { id: string }).id));
  });

  /**
   * Expands a weekly pattern into classes across the term.
   *
   * `preview: true` writes nothing and reports exactly what would happen,
   * including every clash, because generation is all or nothing and finding out
   * by failing on the fortieth row is not an answer.
   */
  app.post('/offerings/:id/sessions', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = generateBody.safeParse(req.body ?? {});
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));

    const result = await generateSessions(c.timetable, actorOf(req), {
      offeringId: (req.params as { id: string }).id,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      preview: parsed.data.preview,
    });
    if (!result.ok) return sendFailure(reply, result.error);

    const report = result.value;
    return sendOk(reply, {
      from: report.from,
      to: report.to,
      created: report.created,
      already_scheduled: report.alreadyThere,
      skipped_days: report.skippedDays.map((d) => ({ date: d.date, label: d.label })),
      clashes: report.clashes.map((clash) => ({
        kind: clash.kind,
        date: clash.sessionDate,
        starts_at: clash.startsAt,
        subject: clash.subject,
        with_course_code: clash.withCourseCode,
        with_section_label: clash.withSectionLabel,
      })),
      occurrences: report.occurrences.map((o) => ({
        date: o.date, starts_at: o.startsAt, ends_at: o.endsAt, room_id: o.roomId,
      })),
    }, parsed.data.preview ? 200 : 201);
  });

  /* --------------------------------------------------------- class sessions */

  /**
   * The signed-in person's own classes.
   *
   * Needs no permission beyond being authenticated, exactly as `/me/teaching`
   * needs none: reading your own timetable is self-scoped, and the set comes
   * from the token subject rather than from anything the client sends.
   */
  app.get('/me/sessions', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const q = req.query as { from?: string; to?: string };
    const rows = await mySessions(c.sessions, actorOf(req), {
      from: q.from ?? null, to: q.to ?? null,
    });
    return sendOk(reply, rows.map((s) => ({
      ...serialiseSession(s),
      // Whether the reader is the one teaching it, so no client has to compare
      // identifiers to find itself.
      i_am_teaching: s.teacherId === req.actor!.sub,
      i_am_standing_in: s.substituteId === req.actor!.sub,
    })));
  });

  app.get('/sessions', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as Record<string, string | undefined>;
    const rows = await listSessions(c.sessions, actorOf(req), {
      from: q.from ?? null,
      to: q.to ?? null,
      termId: q.term_id ?? null,
      offeringId: q.offering_id ?? null,
      sectionId: q.section_id ?? null,
      programId: q.program_id ?? null,
      roomId: q.room_id ?? null,
      teacherId: q.teacher_id ?? null,
      status: (q.status as SessionStatus | undefined) ?? null,
      unmarkedOnly: q.unmarked === 'true',
      limit: q.limit ? Number(q.limit) : null,
    });
    return sendOk(reply, rows.map(serialiseSession));
  });

  app.get('/sessions/:id', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const session = await readSession(c.sessions, actorOf(req), (req.params as { id: string }).id);
    if (!session) return sendFailure(reply, fail('NOT_FOUND', 'That class was not found.'));
    return sendOk(reply, serialiseSession(session));
  });

  app.post('/sessions', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = sessionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await scheduleSession(c.sessions, actorOf(req), {
      offeringId: parsed.data.offering_id,
      sessionDate: parsed.data.session_date,
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      roomId: parsed.data.room_id ?? null,
      substituteId: parsed.data.stand_in_person_id ?? null,
    }), 201);
  });

  app.post('/sessions/:id/reschedule', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = rescheduleBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await rescheduleSession(c.sessions, actorOf(req), {
      id: (req.params as { id: string }).id,
      sessionDate: parsed.data.session_date,
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      roomId: parsed.data.room_id ?? null,
      reason: parsed.data.reason ?? null,
    }));
  });

  app.post('/sessions/:id/cancel', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = cancelBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await cancelSession(c.sessions, actorOf(req), {
      id: (req.params as { id: string }).id, reason: parsed.data.reason,
    }));
  });

  app.patch('/sessions/:id', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = reassignBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await reassignSession(c.sessions, actorOf(req), {
      id: (req.params as { id: string }).id,
      roomId: parsed.data.room_id ?? null,
      substituteId: parsed.data.stand_in_person_id ?? null,
      reason: parsed.data.reason ?? null,
    }));
  });

  /**
   * Records that a class was taught. AD-40 in one route.
   *
   * `session.deliver` says the person may record teaching. Whether it reaches
   * this class is decided by M3's assignment, inside the use case. An
   * administrator holding `session.manage` may record it for a teacher who
   * cannot, and the audit entry distinguishes the two.
   */
  app.post('/sessions/:id/complete', { config: { idempotent: true } }, async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    // The class is read before the permission, because the permission is scoped
    // to the cohort it belongs to: a teacher granted faculty over section A must
    // not be able to record teaching in section B, whatever their assignments.
    const session = await readSession(c.sessions, actorOf(req), (req.params as { id: string }).id);
    if (!session) return sendFailure(reply, fail('NOT_FOUND', 'That class was not found.'));

    const authority = await c.authority.authorityFor(req.actor.tenantId, req.actor.sub);
    const administrative = await c.authority.can(authority, 'session.manage', institutionScope());
    const teaching = administrative || await c.authority.can(
      authority, 'session.deliver', { type: 'section', refId: session.sectionId },
    );
    if (!teaching) {
      return sendFailure(reply, fail('FORBIDDEN', 'You do not have access to do that.'));
    }
    return sendResult(reply, await completeSession(c.sessions, actorOf(req), {
      id: session.id,
      actingAs: administrative ? 'schedule' : 'teach',
    }));
  });
}

function serialiseRoom(r: RoomRecord) {
  return {
    id: r.id, campus_id: r.campusId, campus_name: r.campusName, code: r.code,
    name: r.name, kind: r.kind, capacity: r.capacity, status: r.status,
    slot_count: r.slotCount,
  };
}

function serialiseSlot(s: SlotRecord) {
  return {
    id: s.id, offering_id: s.offeringId, day_of_week: s.dayOfWeek,
    starts_at: s.startsAt, ends_at: s.endsAt,
    room: s.roomId ? { id: s.roomId, code: s.roomCode, name: s.roomName } : null,
    course: { code: s.courseCode, title: s.courseTitle }, component: s.component,
    section: { id: s.sectionId, label: s.sectionLabel },
    program_name: s.programName,
    term: { id: s.termId, name: s.termName },
  };
}

function serialiseSession(s: SessionRecord) {
  return {
    id: s.id,
    offering_id: s.offeringId,
    slot_id: s.slotId,
    date: s.sessionDate,
    starts_at: s.startsAt,
    ends_at: s.endsAt,
    status: s.status,
    room: s.roomId
      ? {
          id: s.roomId, code: s.roomCode, name: s.roomName,
          campus_name: s.campusName, capacity: s.roomCapacity,
        }
      : null,
    // Who is actually teaching it, and whether that is a stand-in. Resolved by
    // the server so neither client reimplements the rule.
    teacher: s.teacherId ? { id: s.teacherId, full_name: s.teacherName } : null,
    stand_in: s.substituteId !== null,
    course: { id: s.courseId, code: s.courseCode, title: s.courseTitle },
    component: s.component,
    section: { id: s.sectionId, label: s.sectionLabel, capacity: s.sectionCapacity },
    term_number: s.termNumber,
    program: { id: s.programId, name: s.programName },
    department_name: s.departmentName,
    term: { id: s.termId, name: s.termName },
    academic_year_name: s.academicYearName,
    cancelled_reason: s.cancelledReason,
    moved_from: s.rescheduledFromDate
      ? { date: s.rescheduledFromDate, starts_at: s.rescheduledFromStartsAt }
      : null,
    completed_at: s.completedAt,
    // Stated by the server, so no client has to reimplement the lifecycle to
    // draw a button.
    allowed_actions: {
      scheduled: ['reschedule', 'cancel', 'complete', 'reassign'],
      completed: [],
      cancelled: [],
    }[s.status],
    // A room smaller than the cohort is a warning, never a refusal: colleges
    // routinely teach sixty-five students in a sixty-seat room.
    room_too_small: s.roomCapacity !== null && s.sectionCapacity !== null
      && s.roomCapacity < s.sectionCapacity,
  };
}

import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  CalendarEventFields, CalendarEventRecord, CalendarEventRepository,
  CalendarPeriod, Clash, NonTeachingDayRecord, NonTeachingDayRepository, RoomKind, RoomRecord,
  RoomRepository, SessionFilter, SessionRecord, SessionRepository, SlotRecord,
  SlotRepository, TeachingReachReader,
} from '../application/ports.ts';

/* -------------------------------------------------------------------- rooms */

const ROOM_SELECT = `
  SELECT r.id, r.campus_id, cam.name AS campus_name, r.code, r.name, r.kind,
         r.capacity, r.status,
         (SELECT count(*)::int FROM timetable_slots ts
           WHERE ts.room_id = r.id AND ts.status = 'active') AS slot_count
    FROM rooms r JOIN campuses cam ON cam.id = r.campus_id`;

export class PgRoomRepository implements RoomRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; campusId: string; code: string; name: string;
    kind: RoomKind; capacity: number | null;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO rooms (id, tenant_id, campus_id, code, name, kind, capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.campusId, input.code, input.name,
        input.kind, input.capacity],
    );
  }

  async findById(tx: Tx, id: string): Promise<RoomRecord | null> {
    const { rows } = await clientOf(tx).query(`${ROOM_SELECT} WHERE r.id = $1`, [id]);
    return rows[0] ? toRoom(rows[0]) : null;
  }

  async list(
    tx: Tx, filter: { campusId?: string | null; includeArchived?: boolean },
  ): Promise<RoomRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.campusId) { values.push(filter.campusId); where.push(`r.campus_id = $${values.length}`); }
    if (!filter.includeArchived) where.push(`r.status = 'active'`);
    const { rows } = await clientOf(tx).query(
      `${ROOM_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
        ORDER BY cam.name, r.code`, values,
    );
    return rows.map(toRoom);
  }

  async update(tx: Tx, input: {
    id: string; name: string; kind: RoomKind; capacity: number | null;
  }): Promise<boolean> {
    // The code is not updatable: it is the room's identity and a timetable
    // already names it.
    const { rowCount } = await clientOf(tx).query(
      `UPDATE rooms SET name = $2, kind = $3, capacity = $4,
              updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`,
      [input.id, input.name, input.kind, input.capacity],
    );
    return (rowCount ?? 0) > 0;
  }

  async archive(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE rooms SET status = 'archived', updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`, [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

/* ------------------------------------------------------- non-teaching days */

export class PgNonTeachingDayRepository implements NonTeachingDayRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; onDate: string; label: string; createdBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO non_teaching_days (id, tenant_id, on_date, label, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.tenantId, input.onDate, input.label, input.createdBy],
    );
  }

  async list(
    tx: Tx, range: { from?: string | null; to?: string | null },
  ): Promise<NonTeachingDayRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (range.from) { values.push(range.from); where.push(`on_date >= $${values.length}`); }
    if (range.to) { values.push(range.to); where.push(`on_date <= $${values.length}`); }
    const { rows } = await clientOf(tx).query(
      `SELECT id, on_date, label FROM non_teaching_days
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY on_date`, values,
    );
    return rows.map((r) => ({ id: r.id, onDate: String(r.on_date), label: r.label }));
  }

  async remove(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `DELETE FROM non_teaching_days WHERE id = $1`, [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async periods(
    tx: Tx, range: { from?: string | null; to?: string | null },
  ): Promise<CalendarPeriod[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT 'year' AS kind, y.id, y.name, NULL AS year_name, y.starts_on, y.ends_on, y.is_current
         FROM academic_years y
        WHERE y.status <> 'archived'
          AND ($1::date IS NULL OR y.ends_on >= $1::date)
          AND ($2::date IS NULL OR y.starts_on <= $2::date)
       UNION ALL
       SELECT 'term', t.id, t.name, y.name, t.starts_on, t.ends_on, y.is_current
         FROM terms t
         JOIN academic_years y ON y.id = t.academic_year_id
        WHERE t.status <> 'archived'
          AND ($1::date IS NULL OR t.ends_on >= $1::date)
          AND ($2::date IS NULL OR t.starts_on <= $2::date)
        ORDER BY starts_on, kind DESC`,
      [range.from ?? null, range.to ?? null],
    );
    return rows.map((r) => ({
      kind: r.kind, id: r.id, name: r.name, yearName: r.year_name ?? null,
      startsOn: String(r.starts_on), endsOn: String(r.ends_on), isCurrent: Boolean(r.is_current),
    }));
  }
}

/* --------------------------------------------------------- calendar events */

const hhmm = (v: unknown) => (v == null ? null : String(v).slice(0, 5));

function toEvent(r: any): CalendarEventRecord {
  return {
    id: r.id, title: r.title, onDate: String(r.on_date),
    startsAt: hhmm(r.starts_at), endsAt: hhmm(r.ends_at), note: r.note ?? null,
  };
}

export class PgCalendarEventRepository implements CalendarEventRepository {
  async create(
    tx: Tx, input: CalendarEventFields & { id: string; tenantId: string; createdBy: string },
  ): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO calendar_events (id, tenant_id, title, on_date, starts_at, ends_at, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.title, input.onDate, input.startsAt, input.endsAt, input.note, input.createdBy],
    );
  }

  async find(tx: Tx, id: string): Promise<CalendarEventRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, title, on_date, starts_at, ends_at, note FROM calendar_events
        WHERE id = $1 AND removed_at IS NULL`, [id],
    );
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async update(tx: Tx, id: string, f: CalendarEventFields): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE calendar_events
          SET title = $2, on_date = $3, starts_at = $4, ends_at = $5, note = $6, updated_at = now()
        WHERE id = $1 AND removed_at IS NULL`,
      [id, f.title, f.onDate, f.startsAt, f.endsAt, f.note],
    );
    return (rowCount ?? 0) > 0;
  }

  async remove(tx: Tx, id: string, by: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE calendar_events SET removed_at = now(), removed_by = $2, updated_at = now()
        WHERE id = $1 AND removed_at IS NULL`,
      [id, by],
    );
    return (rowCount ?? 0) > 0;
  }

  async list(
    tx: Tx, range: { from?: string | null; to?: string | null },
  ): Promise<CalendarEventRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, title, on_date, starts_at, ends_at, note FROM calendar_events
        WHERE removed_at IS NULL
          AND ($1::date IS NULL OR on_date >= $1::date)
          AND ($2::date IS NULL OR on_date <= $2::date)
        ORDER BY on_date, starts_at NULLS FIRST, title`,
      [range.from ?? null, range.to ?? null],
    );
    return rows.map(toEvent);
  }
}

/* --------------------------------------------------------- timetable slots */

const SLOT_SELECT = `
  SELECT ts.id, ts.offering_id, ts.day_of_week, ts.starts_at, ts.ends_at,
         ts.room_id, r.code AS room_code, r.name AS room_name,
         c.code AS course_code, c.title AS course_title, o.component,
         o.section_id, s.label AS section_label, p.name AS program_name,
         s.term_id, t.name AS term_name
    FROM timetable_slots ts
    JOIN course_offerings o ON o.id = ts.offering_id
    JOIN courses c ON c.id = o.course_id
    JOIN sections s ON s.id = o.section_id
    JOIN programs p ON p.id = s.program_id
    JOIN terms t ON t.id = s.term_id
    LEFT JOIN rooms r ON r.id = ts.room_id`;

export class PgSlotRepository implements SlotRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; dayOfWeek: number;
    startsAt: string; endsAt: string; roomId: string | null; createdBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO timetable_slots
         (id, tenant_id, offering_id, day_of_week, starts_at, ends_at, room_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.offeringId, input.dayOfWeek,
        input.startsAt, input.endsAt, input.roomId, input.createdBy],
    );
  }

  async findById(tx: Tx, id: string): Promise<SlotRecord | null> {
    const { rows } = await clientOf(tx).query(
      `${SLOT_SELECT} WHERE ts.id = $1 AND ts.status = 'active'`, [id],
    );
    return rows[0] ? toSlot(rows[0]) : null;
  }

  async list(
    tx: Tx, filter: { offeringId?: string | null; termId?: string | null },
  ): Promise<SlotRecord[]> {
    const where = [`ts.status = 'active'`];
    const values: unknown[] = [];
    if (filter.offeringId) {
      values.push(filter.offeringId); where.push(`ts.offering_id = $${values.length}`);
    }
    if (filter.termId) { values.push(filter.termId); where.push(`s.term_id = $${values.length}`); }
    const { rows } = await clientOf(tx).query(
      `${SLOT_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY ts.day_of_week, ts.starts_at`, values,
    );
    return rows.map(toSlot);
  }

  async remove(tx: Tx, id: string): Promise<boolean> {
    // Removed, not deleted: sessions generated from it record which slot
    // produced them, and the application role holds no DELETE here.
    const { rowCount } = await clientOf(tx).query(
      `UPDATE timetable_slots SET status = 'removed', updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`, [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

/* ---------------------------------------------------------- class sessions */

/**
 * A session carries its whole teaching context in one query: course, cohort,
 * program, term, room and the person actually teaching it. Both a coordinator's
 * day view and a teacher's own list need the same facts, and two queries would
 * drift apart.
 *
 * The effective teacher is the stand-in if one is set, and otherwise the
 * offering's live lead. That resolution lives here, in one expression, rather
 * than in each caller.
 */
const SESSION_SELECT = `
  SELECT cs.id, cs.offering_id, cs.slot_id, cs.session_date, cs.starts_at, cs.ends_at,
         cs.status, cs.room_id, r.code AS room_code, r.name AS room_name,
         cam.name AS campus_name, r.capacity AS room_capacity,
         cs.instructor_person_id AS substitute_id,
         coalesce(cs.instructor_person_id, ia.person_id) AS teacher_id,
         coalesce(sub.full_name, lead_person.full_name) AS teacher_name,
         cs.cancelled_reason, cs.rescheduled_from_date, cs.rescheduled_from_starts_at,
         cs.completed_at,
         o.course_id, c.code AS course_code, c.title AS course_title, o.component,
         o.section_id, s.label AS section_label, s.capacity AS section_capacity,
         s.term_number, s.program_id, p.name AS program_name, d.name AS department_name,
         s.term_id, t.name AS term_name, y.name AS academic_year_name
    FROM class_sessions cs
    JOIN course_offerings o ON o.id = cs.offering_id
    JOIN courses c ON c.id = o.course_id
    JOIN sections s ON s.id = o.section_id
    JOIN programs p ON p.id = s.program_id
    JOIN departments d ON d.id = p.department_id
    JOIN terms t ON t.id = s.term_id
    JOIN academic_years y ON y.id = t.academic_year_id
    LEFT JOIN rooms r ON r.id = cs.room_id
    LEFT JOIN campuses cam ON cam.id = r.campus_id
    LEFT JOIN instructor_assignments ia
           ON ia.offering_id = o.id AND ia.valid_to IS NULL AND ia.role = 'lead'
    LEFT JOIN persons lead_person ON lead_person.id = ia.person_id
    LEFT JOIN persons sub ON sub.id = cs.instructor_person_id`;

export class PgSessionRepository implements SessionRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; slotId: string | null;
    sessionDate: string; startsAt: string; endsAt: string; roomId: string | null;
    substituteId: string | null; createdBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO class_sessions
         (id, tenant_id, offering_id, slot_id, session_date, starts_at, ends_at,
          room_id, instructor_person_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [input.id, input.tenantId, input.offeringId, input.slotId, input.sessionDate,
        input.startsAt, input.endsAt, input.roomId, input.substituteId, input.createdBy],
    );
  }

  async findById(tx: Tx, id: string): Promise<SessionRecord | null> {
    const { rows } = await clientOf(tx).query(`${SESSION_SELECT} WHERE cs.id = $1`, [id]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async list(tx: Tx, filter: SessionFilter): Promise<SessionRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (clause: (n: number) => string, value: unknown) => {
      values.push(value);
      where.push(clause(values.length));
    };

    if (filter.from) add((n) => `cs.session_date >= $${n}`, filter.from);
    if (filter.to) add((n) => `cs.session_date <= $${n}`, filter.to);
    if (filter.termId) add((n) => `s.term_id = $${n}`, filter.termId);
    if (filter.offeringId) add((n) => `cs.offering_id = $${n}`, filter.offeringId);
    if (filter.sectionId) add((n) => `o.section_id = $${n}`, filter.sectionId);
    if (filter.programId) add((n) => `s.program_id = $${n}`, filter.programId);
    if (filter.roomId) add((n) => `cs.room_id = $${n}`, filter.roomId);
    if (filter.status) add((n) => `cs.status = $${n}`, filter.status);
    if (filter.teacherId) {
      add((n) => `coalesce(cs.instructor_person_id, ia.person_id) = $${n}`, filter.teacherId);
    }
    // The self feed, derived from M3's assignments rather than from anything a
    // client sends. A co-instructor sees the class even though the lead is the
    // one recorded as teaching it.
    if (filter.minePersonId) {
      add((n) => `(cs.instructor_person_id = $${n} OR EXISTS (
        SELECT 1 FROM instructor_assignments mine
         WHERE mine.offering_id = o.id AND mine.person_id = $${n} AND mine.valid_to IS NULL))`,
      filter.minePersonId);
    }
    // Nobody said whether it ran, and its day has gone. Derived, never stored:
    // a fourth status would need a job to maintain and would be wrong for as
    // long as that job lagged.
    if (filter.unmarkedOnly) where.push(`cs.status = 'scheduled' AND cs.session_date < current_date`);

    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 1000) : 1000;
    const { rows } = await clientOf(tx).query(
      `${SESSION_SELECT}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY cs.session_date, cs.starts_at, c.code
        LIMIT ${limit}`, values,
    );
    return rows.map(toSession);
  }

  async existingOccurrences(
    tx: Tx, offeringId: string, from: string, to: string,
  ): Promise<Array<{ date: string; startsAt: string }>> {
    const { rows } = await clientOf(tx).query(
      `SELECT session_date, starts_at FROM class_sessions
        WHERE offering_id = $1 AND status <> 'cancelled'
          AND session_date BETWEEN $2 AND $3`,
      [offeringId, from, to],
    );
    return rows.map((r) => ({
      date: String(r.session_date), startsAt: toTimeString(r.starts_at),
    }));
  }

  async reschedule(tx: Tx, input: {
    id: string; sessionDate: string; startsAt: string; endsAt: string;
    roomId: string | null; fromDate: string; fromStartsAt: string;
  }): Promise<boolean> {
    // Only while scheduled. A completed session is refused by the trigger too;
    // the status guard here makes the refusal a no-op rather than an error the
    // caller has to translate.
    const { rowCount } = await clientOf(tx).query(
      `UPDATE class_sessions
          SET session_date = $2, starts_at = $3, ends_at = $4, room_id = $5,
              rescheduled_from_date = coalesce(rescheduled_from_date, $6),
              rescheduled_from_starts_at = coalesce(rescheduled_from_starts_at, $7),
              updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'scheduled'`,
      [input.id, input.sessionDate, input.startsAt, input.endsAt, input.roomId,
        input.fromDate, input.fromStartsAt],
    );
    return (rowCount ?? 0) > 0;
  }

  async cancel(tx: Tx, input: { id: string; reason: string; at: Date }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE class_sessions
          SET status = 'cancelled', cancelled_reason = $2, updated_at = $3,
              version = version + 1
        WHERE id = $1 AND status = 'scheduled'`,
      [input.id, input.reason, input.at],
    );
    return (rowCount ?? 0) > 0;
  }

  async complete(tx: Tx, input: { id: string; by: string; at: Date }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE class_sessions
          SET status = 'completed', completed_at = $3, completed_by = $2,
              updated_at = $3, version = version + 1
        WHERE id = $1 AND status = 'scheduled'`,
      [input.id, input.by, input.at],
    );
    return (rowCount ?? 0) > 0;
  }

  async reassign(tx: Tx, input: {
    id: string; roomId: string | null; substituteId: string | null;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE class_sessions
          SET room_id = $2, instructor_person_id = $3,
              updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'scheduled'`,
      [input.id, input.roomId, input.substituteId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Collisions for a whole proposed timetable, in one query.
   *
   * The triggers are the enforcement; this exists so a preview can tell the
   * coordinator what will fail before anything is written, instead of aborting
   * a ninety-session generation on its fortieth row.
   */
  async clashesFor(tx: Tx, input: {
    offeringId: string;
    occurrences: Array<{ date: string; startsAt: string; endsAt: string; roomId: string | null }>;
  }): Promise<Clash[]> {
    if (input.occurrences.length === 0) return [];

    const { rows } = await clientOf(tx).query(
      `WITH proposed(session_date, starts_at, ends_at, room_id) AS (
         SELECT d::date, s::time, e::time, rid::uuid
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS t(d, s, e, rid)
       ),
       -- Who would teach the proposed sessions: the offering's live lead, since
       -- generation never sets a stand-in.
       teacher AS (
         SELECT person_id FROM instructor_assignments
          WHERE offering_id = $1 AND valid_to IS NULL AND role = 'lead'
       )
       SELECT 'room' AS kind, pr.session_date, pr.starts_at,
              c.code AS with_course_code, s.label AS with_section_label,
              r.code AS subject
         FROM proposed pr
         JOIN class_sessions x ON x.room_id = pr.room_id
          AND x.session_date = pr.session_date
          AND x.status <> 'cancelled'
          AND x.offering_id <> $1
          AND x.starts_at < pr.ends_at AND x.ends_at > pr.starts_at
         JOIN course_offerings o ON o.id = x.offering_id
         JOIN courses c ON c.id = o.course_id
         JOIN sections s ON s.id = o.section_id
         JOIN rooms r ON r.id = x.room_id
        WHERE pr.room_id IS NOT NULL
       UNION ALL
       SELECT 'instructor' AS kind, pr.session_date, pr.starts_at,
              c.code AS with_course_code, s.label AS with_section_label,
              p.full_name AS subject
         FROM proposed pr
         CROSS JOIN teacher tc
         JOIN persons p ON p.id = tc.person_id
         JOIN class_sessions x ON x.session_date = pr.session_date
          AND x.status <> 'cancelled'
          AND x.offering_id <> $1
          AND x.starts_at < pr.ends_at AND x.ends_at > pr.starts_at
         JOIN course_offerings o ON o.id = x.offering_id
         JOIN courses c ON c.id = o.course_id
         JOIN sections s ON s.id = o.section_id
         LEFT JOIN instructor_assignments ia
                ON ia.offering_id = x.offering_id AND ia.valid_to IS NULL AND ia.role = 'lead'
        WHERE coalesce(x.instructor_person_id, ia.person_id) = tc.person_id
        ORDER BY 2, 3`,
      [
        input.offeringId,
        input.occurrences.map((o) => o.date),
        input.occurrences.map((o) => o.startsAt),
        input.occurrences.map((o) => o.endsAt),
        input.occurrences.map((o) => o.roomId),
      ],
    );

    return rows.map((r) => ({
      kind: r.kind as 'room' | 'instructor',
      sessionDate: String(r.session_date),
      startsAt: toTimeString(r.starts_at),
      withCourseCode: r.with_course_code,
      withSectionLabel: r.with_section_label,
      subject: r.subject,
    }));
  }
}

/**
 * Teaching reach, read from M3's authoritative assignment (AD-40).
 *
 * Deliberately a reader over M3's tables rather than a copy of them: there is
 * one statement of who teaches what, and M4 asks it rather than keeping its own.
 */
export class PgTeachingReachReader implements TeachingReachReader {
  async leadsOffering(tx: Tx, offeringId: string, personId: string): Promise<boolean> {
    const { rows } = await clientOf(tx).query(
      `SELECT 1 FROM instructor_assignments
        WHERE offering_id = $1 AND person_id = $2 AND valid_to IS NULL AND role = 'lead'`,
      [offeringId, personId],
    );
    return rows.length > 0;
  }

  async teachesOffering(tx: Tx, offeringId: string, personId: string): Promise<boolean> {
    const { rows } = await clientOf(tx).query(
      `SELECT 1 FROM instructor_assignments
        WHERE offering_id = $1 AND person_id = $2 AND valid_to IS NULL`,
      [offeringId, personId],
    );
    return rows.length > 0;
  }
}

/* ------------------------------------------------------------------ mapping */

/** PostgreSQL sends `time` as 'HH:MM:SS'. Minutes are all a timetable needs. */
function toTimeString(value: string): string {
  return String(value).slice(0, 5);
}

function toRoom(r: any): RoomRecord {
  return {
    id: r.id, campusId: r.campus_id, campusName: r.campus_name, code: r.code,
    name: r.name, kind: r.kind, capacity: r.capacity, status: r.status,
    slotCount: r.slot_count,
  };
}

function toSlot(r: any): SlotRecord {
  return {
    id: r.id, offeringId: r.offering_id, dayOfWeek: r.day_of_week,
    startsAt: toTimeString(r.starts_at), endsAt: toTimeString(r.ends_at),
    roomId: r.room_id, roomCode: r.room_code, roomName: r.room_name,
    courseCode: r.course_code, courseTitle: r.course_title, component: r.component,
    sectionId: r.section_id, sectionLabel: r.section_label, programName: r.program_name,
    termId: r.term_id, termName: r.term_name,
  };
}

function toSession(r: any): SessionRecord {
  return {
    id: r.id, offeringId: r.offering_id, slotId: r.slot_id,
    sessionDate: String(r.session_date),
    startsAt: toTimeString(r.starts_at), endsAt: toTimeString(r.ends_at),
    status: r.status,
    roomId: r.room_id, roomCode: r.room_code, roomName: r.room_name,
    campusName: r.campus_name, roomCapacity: r.room_capacity,
    substituteId: r.substitute_id, teacherId: r.teacher_id, teacherName: r.teacher_name,
    cancelledReason: r.cancelled_reason,
    rescheduledFromDate: r.rescheduled_from_date === null
      ? null : String(r.rescheduled_from_date),
    rescheduledFromStartsAt: r.rescheduled_from_starts_at === null
      ? null : toTimeString(r.rescheduled_from_starts_at),
    completedAt: r.completed_at,
    courseId: r.course_id, courseCode: r.course_code, courseTitle: r.course_title,
    component: r.component,
    sectionId: r.section_id, sectionLabel: r.section_label,
    sectionCapacity: r.section_capacity, termNumber: r.term_number,
    programId: r.program_id, programName: r.program_name,
    departmentName: r.department_name,
    termId: r.term_id, termName: r.term_name, academicYearName: r.academic_year_name,
  };
}

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
export type RoomKind = 'classroom' | 'lab' | 'seminar' | 'auditorium';

export interface Room {
  id: string;
  campus_id: string;
  campus_name: string;
  code: string;
  name: string;
  kind: RoomKind;
  capacity: number | null;
  status: 'active' | 'archived';
  slot_count: number;
}

export interface NonTeachingDay {
  id: string;
  on_date: string;
  label: string;
}

export interface Slot {
  id: string;
  offering_id: string;
  /** ISO-8601: 1 is Monday, 7 is Sunday. */
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  room: { id: string; code: string; name: string } | null;
  course: { code: string; title: string };
  component: string;
  section: { id: string; label: string };
  program_name: string;
  term: { id: string; name: string };
}

export interface ClassSession {
  id: string;
  offering_id: string;
  slot_id: string | null;
  date: string;
  starts_at: string;
  ends_at: string;
  status: SessionStatus;
  room: {
    id: string; code: string; name: string;
    campus_name: string | null; capacity: number | null;
  } | null;
  /** Who is actually teaching: the stand-in, or the offering's lead. */
  teacher: { id: string; full_name: string } | null;
  stand_in: boolean;
  course: { id: string; code: string; title: string };
  component: string;
  section: { id: string; label: string; capacity: number | null };
  term_number: number;
  program: { id: string; name: string };
  department_name: string;
  term: { id: string; name: string };
  academic_year_name: string;
  cancelled_reason: string | null;
  moved_from: { date: string; starts_at: string | null } | null;
  completed_at: string | null;
  /** Stated by the server, so no client reimplements the lifecycle. */
  allowed_actions: string[];
  room_too_small: boolean;
}

export interface GenerationReport {
  from: string;
  to: string;
  created: number;
  already_scheduled: number;
  skipped_days: Array<{ date: string; label: string }>;
  clashes: Array<{
    kind: 'room' | 'instructor';
    date: string;
    starts_at: string;
    subject: string;
    with_course_code: string;
    with_section_label: string;
  }>;
  occurrences: Array<{ date: string; starts_at: string; ends_at: string; room_id: string | null }>;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const COMPONENT_LABEL: Record<string, string> = {
  lecture: 'Lecture', lab: 'Lab', tutorial: 'Tutorial',
};

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  classroom: 'Classroom', lab: 'Lab', seminar: 'Seminar room', auditorium: 'Auditorium',
};

/* ------------------------------------------------------------ calendar maths */
/**
 * Every date here is a 'YYYY-MM-DD' string handled in UTC.
 *
 * A local Date would shift the day for every timezone east of UTC and again
 * across a daylight-saving boundary, which is how a timetable ends up wrong by
 * one day in some months and right in others.
 */
const DAY_MS = 86_400_000;

export const today = (): string => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO-8601 day numbering: 1 is Monday, 7 is Sunday. */
export function isoDayOfWeek(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Weeks start on Monday, which is how a college timetable is drawn. */
export function startOfWeek(date: string): string {
  return addDays(date, -(isoDayOfWeek(date) - 1));
}

export function dayLabel(date: string): string {
  return `${DAY_NAMES[isoDayOfWeek(date) - 1]}, ${new Date(`${date}T00:00:00Z`)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return dayLabel(from);
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(from)} to ${fmt(to)}`;
}

/* ----------------------------------------------------------------- grouping */

export function groupByDate(
  sessions: ClassSession[],
): Array<{ date: string; sessions: ClassSession[] }> {
  const order: string[] = [];
  const byDate = new Map<string, ClassSession[]>();
  for (const session of sessions) {
    const list = byDate.get(session.date);
    if (list) list.push(session);
    else { order.push(session.date); byDate.set(session.date, [session]); }
  }
  return order.map((date) => ({ date, sessions: byDate.get(date)! }));
}

/* ------------------------------------------------------------------ filters */

export interface SessionFilters {
  query: string;
  programId: string | null;
  roomId: string | null;
  status: SessionStatus | 'all';
  unmarkedOnly: boolean;
}

export const NO_FILTERS: SessionFilters = {
  query: '', programId: null, roomId: null, status: 'all', unmarkedOnly: false,
};

export const isFiltering = (f: SessionFilters): boolean =>
  f.query.trim() !== '' || f.programId !== null || f.roomId !== null
  || f.status !== 'all' || f.unmarkedOnly;

/**
 * A class still marked scheduled whose day has gone: nobody said whether it ran.
 *
 * Derived, never stored, exactly as the server derives it. A fourth status would
 * need a job to maintain and would be wrong for as long as that job lagged.
 */
export const isUnmarked = (session: ClassSession, now = today()): boolean =>
  session.status === 'scheduled' && session.date < now;

export function filterSessions(
  sessions: ClassSession[], filters: SessionFilters, now = today(),
): ClassSession[] {
  const q = filters.query.trim().toLowerCase();
  return sessions.filter((s) => {
    if (filters.programId && s.program.id !== filters.programId) return false;
    if (filters.roomId && s.room?.id !== filters.roomId) return false;
    if (filters.status !== 'all' && s.status !== filters.status) return false;
    if (filters.unmarkedOnly && !isUnmarked(s, now)) return false;
    if (!q) return true;
    return s.course.code.toLowerCase().includes(q)
      || s.course.title.toLowerCase().includes(q)
      || s.section.label.toLowerCase().includes(q)
      || (s.teacher?.full_name ?? '').toLowerCase().includes(q)
      || (s.room?.code ?? '').toLowerCase().includes(q);
  });
}

export const unmarkedCount = (sessions: ClassSession[], now = today()): number =>
  sessions.filter((s) => isUnmarked(s, now)).length;

/* ----------------------------------------------------------------- warnings */

/**
 * What is wrong with this class, in the order an operator cares about.
 *
 * Every entry is actionable. A warning nobody can act on is noise that trains
 * people to ignore the ones that matter.
 */
export function sessionWarnings(session: ClassSession, now = today()): string[] {
  const warnings: string[] = [];
  if (isUnmarked(session, now)) {
    warnings.push('Nobody has said whether this class ran.');
  }
  if (session.status === 'scheduled' && !session.teacher) {
    warnings.push('No instructor is assigned to this course.');
  }
  if (session.status === 'scheduled' && !session.room) {
    warnings.push('No room. Nobody knows where to go.');
  }
  if (session.room_too_small && session.room && session.section.capacity !== null) {
    warnings.push(
      `${session.room.code} seats ${session.room.capacity}, and the cohort is ${
        session.section.capacity}.`,
    );
  }
  return warnings;
}

/** Whether anything on this class needs attention, for a list indicator. */
export const needsAttention = (session: ClassSession, now = today()): boolean =>
  sessionWarnings(session, now).length > 0;

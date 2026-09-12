export type AttendanceState = 'present' | 'absent' | 'late' | 'excused';
export type SheetStatus = 'draft' | 'submitted';

export const STATES: AttendanceState[] = ['present', 'absent', 'late', 'excused'];

export const STATE_LABEL: Record<AttendanceState, string> = {
  present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused',
};

/** One letter for a dense register, with the word carried in the label. */
export const STATE_LETTER: Record<AttendanceState, string> = {
  present: 'P', absent: 'A', late: 'L', excused: 'E',
};

/** One class in the overview, with the state of its register. */
export interface OverviewRow {
  session_id: string;
  date: string;
  starts_at: string;
  course: { code: string; title: string };
  section: { id: string; label: string };
  program_name: string;
  teacher: { id: string; full_name: string } | null;
  session_status: 'scheduled' | 'completed' | 'cancelled';
  status: SheetStatus;
  marked: number;
  counts: Record<AttendanceState, number>;
  submitted_at: string | null;
}

export interface RegisterStudent {
  student_id: string;
  full_name: string;
  enrolment_number: string;
  student_status: string;
  /** Null means nobody has said anything yet, which is not absent. */
  state: AttendanceState | null;
  note: string | null;
  record_id: string | null;
  marked_by: string | null;
  marked_at: string | null;
}

export interface Correction {
  id: string;
  record_id: string;
  student_name: string;
  from_state: AttendanceState;
  to_state: AttendanceState;
  reason: string;
  corrected_by: string | null;
  corrected_at: string;
}

export interface Register {
  session: {
    id: string;
    date: string;
    starts_at: string;
    ends_at: string;
    status: string;
    course: { id: string; code: string; title: string };
    component: string;
    section: { id: string; label: string };
    program: { id: string; name: string };
    term: { id: string; name: string };
    room: { id: string; code: string } | null;
    teacher: { id: string; full_name: string } | null;
  };
  sheet: {
    status: SheetStatus;
    version: number;
    submitted_at: string | null;
    submitted_by: string | null;
  };
  students: RegisterStudent[];
  corrections: Correction[];
  summary: Record<AttendanceState, number> & {
    marked: number; unmarked: number; total: number;
  };
  /** Stated by the server, so no client reimplements the rules. */
  can_mark: boolean;
  can_submit: boolean;
  can_correct: boolean;
}

/**
 * A class whose day has gone with no register submitted.
 *
 * The one question the overview exists to answer: attendance that nobody has
 * accounted for is the thing that quietly becomes impossible to reconstruct.
 */
export const isOutstanding = (row: OverviewRow, now: string): boolean =>
  row.session_status !== 'cancelled' && row.status !== 'submitted' && row.date < now;

export const outstandingCount = (rows: OverviewRow[], now: string): number =>
  rows.filter((r) => isOutstanding(r, now)).length;

export interface OverviewFilters {
  query: string;
  outstandingOnly: boolean;
  status: SheetStatus | 'all';
}

export const NO_FILTERS: OverviewFilters = {
  query: '', outstandingOnly: false, status: 'all',
};

export const isFiltering = (f: OverviewFilters): boolean =>
  f.query.trim() !== '' || f.outstandingOnly || f.status !== 'all';

export function filterOverview(
  rows: OverviewRow[], filters: OverviewFilters, now: string,
): OverviewRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.outstandingOnly && !isOutstanding(row, now)) return false;
    if (filters.status !== 'all' && row.status !== filters.status) return false;
    if (!q) return true;
    return row.course.code.toLowerCase().includes(q)
      || row.course.title.toLowerCase().includes(q)
      || row.section.label.toLowerCase().includes(q)
      || (row.teacher?.full_name ?? '').toLowerCase().includes(q);
  });
}

/** How far through a register somebody is, for a progress line in the list. */
export function progressOf(row: OverviewRow): string {
  if (row.session_status === 'cancelled') return 'Class cancelled';
  if (row.status === 'submitted') {
    const total = STATES.reduce((sum, s) => sum + row.counts[s], 0);
    return `Submitted · ${row.counts.present} of ${total} present`;
  }
  if (row.marked === 0) return 'Not started';
  return `${row.marked} marked, not submitted`;
}

/**
 * Why this register cannot be submitted yet, in words an operator can act on.
 *
 * The server refuses the same cases; saying them here means the button is never
 * a dead end without an explanation.
 */
export function submitBlockedReason(register: Register): string | null {
  if (register.sheet.status === 'submitted') return 'This register has been submitted.';
  if (!register.can_submit) return 'You cannot submit this register.';
  if (register.summary.unmarked > 0) {
    const n = register.summary.unmarked;
    return `${n} ${n === 1 ? 'student has' : 'students have'} no mark yet. Every student needs one before you submit.`;
  }
  return null;
}

/** Corrections for one student, newest first, for the row that carries them. */
export function correctionsFor(register: Register, recordId: string | null): Correction[] {
  if (!recordId) return [];
  return register.corrections.filter((c) => c.record_id === recordId);
}

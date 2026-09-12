export type StudentStatus = 'enrolled' | 'on_leave' | 'withdrawn' | 'graduated';

export interface Student {
  id: string;
  person_id: string;
  full_name: string;
  email: string | null;
  enrolment_number: string;
  program: { id: string; name: string };
  admitted_on: string;
  status: StudentStatus;
  status_reason: string | null;
  /** The cohort they are in now. Null is normal at the start of a term. */
  section: { id: string; label: string | null; term_number: number | null } | null;
}

export interface Placement {
  id: string;
  section_id: string;
  valid_from: string;
  valid_to: string | null;
  end_reason: string | null;
  is_current: boolean;
}

export interface RosterEntry {
  student_id: string;
  person_id: string;
  full_name: string;
  enrolment_number: string;
  student_status: StudentStatus;
  enrolled_from: string;
  enrolled_to: string | null;
}

export interface Roster {
  on: string;
  students: RosterEntry[];
}

export const STATUS_LABEL: Record<StudentStatus, string> = {
  enrolled: 'Enrolled', on_leave: 'On leave', withdrawn: 'Withdrawn', graduated: 'Graduated',
};

/** Initials for an avatar, cheaper and more reliable than a photo per row. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface StudentFilters {
  query: string;
  programId: string | null;
  status: StudentStatus | 'all';
  unplacedOnly: boolean;
}

export const NO_FILTERS: StudentFilters = {
  query: '', programId: null, status: 'all', unplacedOnly: false,
};

export const isFiltering = (f: StudentFilters): boolean =>
  f.query.trim() !== '' || f.programId !== null || f.status !== 'all' || f.unplacedOnly;

/**
 * Filtering happens here, on a page already loaded, so a keystroke costs no
 * request. The server takes the same filters for the cases where the list is
 * larger than one page.
 */
export function filterStudents(students: Student[], filters: StudentFilters): Student[] {
  const q = filters.query.trim().toLowerCase();
  return students.filter((s) => {
    if (filters.programId && s.program.id !== filters.programId) return false;
    if (filters.status !== 'all' && s.status !== filters.status) return false;
    if (filters.unplacedOnly && s.section !== null) return false;
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q)
      || s.enrolment_number.toLowerCase().includes(q)
      || (s.email ?? '').toLowerCase().includes(q);
  });
}

/**
 * Students the college has admitted but not yet put in a cohort.
 *
 * The queue an operator works from at the start of a term, and the reason it is
 * a first-class filter: an unplaced student is on nobody's roster and will be
 * quietly missing from every register until somebody notices.
 */
export const unplacedCount = (students: Student[]): number =>
  students.filter((s) => s.status === 'enrolled' && s.section === null).length;

/** Why this student cannot be placed in a cohort, in words an operator can act on. */
export function placementBlockedReason(student: Student): string | null {
  if (student.status === 'enrolled') return null;
  if (student.status === 'withdrawn') {
    return `${student.full_name} has withdrawn. Reinstate them before placing them in a cohort.`;
  }
  if (student.status === 'graduated') return `${student.full_name} has graduated.`;
  return `${student.full_name} is on leave. Bring them back before placing them in a cohort.`;
}

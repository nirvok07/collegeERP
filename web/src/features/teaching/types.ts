export type SectionStatus = 'planned' | 'open' | 'active' | 'completed' | 'cancelled';
export type OfferingStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type Component = 'lecture' | 'lab' | 'tutorial';
export type InstructorRole = 'lead' | 'co' | 'assistant';

export interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  term_count: number;
}

export interface Term {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  sequence: number;
  name: string;
}

export interface Section {
  id: string;
  label: string;
  status: SectionStatus;
  term_number: number;
  capacity: number | null;
  cancelled_reason: string | null;
  program: { id: string; name: string; code: string };
  department_name: string;
  campus_name: string;
  academic_year: { id: string; name: string };
  term: { id: string; name: string };
  allowed_transitions: SectionStatus[];
}

export interface Instructor {
  assignment_id: string;
  person_id: string;
  full_name: string;
  role: InstructorRole;
  since: string;
}

export interface Offering {
  id: string;
  component: Component;
  status: OfferingStatus;
  cancelled_reason: string | null;
  course: { id: string; code: string; title: string };
  section: { id: string; label: string; status: SectionStatus; term_number: number };
  program: { id: string; name: string };
  department_name: string;
  term: { id: string; name: string };
  academic_year_name: string;
  instructors: Instructor[];
  allowed_transitions: OfferingStatus[];
  /** Stated by the server, so no client offers a start the trigger refuses. */
  can_activate: boolean;
}

export interface AssignmentHistoryEntry {
  id: string;
  full_name: string;
  role: InstructorRole;
  valid_from: string;
  valid_to: string | null;
  end_reason: string | null;
  is_current: boolean;
}

/** Why an offering cannot start, in words an operator can act on. */
export function blockedReason(offering: Offering): string | null {
  if (offering.status !== 'planned') return null;
  if (offering.section.status !== 'active') {
    return `Section ${offering.section.label} is ${offering.section.status} and is not yet teaching.`;
  }
  if (offering.instructors.length === 0) {
    return 'No instructor assigned. Attendance is recorded against whoever is teaching.';
  }
  return null;
}

export const leadOf = (offering: Offering): Instructor | undefined =>
  offering.instructors.find((i) => i.role === 'lead');

/** Groups offerings under their section, which is how the workspace reads. */
export function groupBySection(
  sections: Section[], offerings: Offering[],
): Array<{ section: Section; offerings: Offering[] }> {
  const bySection = new Map<string, Offering[]>();
  for (const offering of offerings) {
    const list = bySection.get(offering.section.id);
    if (list) list.push(offering);
    else bySection.set(offering.section.id, [offering]);
  }
  return sections.map((section) => ({
    section,
    offerings: bySection.get(section.id) ?? [],
  }));
}

export const ROLE_LABEL: Record<InstructorRole, string> = {
  lead: 'Lead', co: 'Co-teacher', assistant: 'Assistant',
};

export const COMPONENT_LABEL: Record<Component, string> = {
  lecture: 'Lecture', lab: 'Lab', tutorial: 'Tutorial',
};

/**
 * Why instructors cannot be changed here, in words an operator can act on.
 *
 * A finished offering keeps the teaching history it was recorded with, because
 * attendance and marks already point at it.
 */
export function assignmentClosedReason(offering: Offering): string | null {
  if (offering.status === 'completed') {
    return 'This course is complete. Its teaching record stays as it was.';
  }
  if (offering.status === 'cancelled') {
    return 'This course was cancelled. Its teaching record stays as it was.';
  }
  return null;
}

export interface OfferingFilters {
  query: string;
  programId: string | null;
  status: OfferingStatus | 'all';
  unstaffedOnly: boolean;
}

export const NO_FILTERS: OfferingFilters = {
  query: '', programId: null, status: 'all', unstaffedOnly: false,
};

export const isFiltering = (f: OfferingFilters): boolean =>
  f.query.trim() !== '' || f.programId !== null || f.status !== 'all' || f.unstaffedOnly;

/**
 * The workspace reads cohort first, then what each cohort is taught, because
 * that is the relationship an operator is reasoning about. A filter narrows the
 * courses and then hides cohorts left with nothing, so the screen after a search
 * is the answer rather than another list to scan.
 *
 * Filtering happens here, not on the server, because the whole term is already
 * loaded and a keystroke should not cost a request.
 */
export function visibleGroups(
  sections: Section[], offerings: Offering[], filters: OfferingFilters,
): Array<{ section: Section; offerings: Offering[] }> {
  const q = filters.query.trim().toLowerCase();
  const matching = offerings.filter((o) => {
    if (filters.programId && o.program.id !== filters.programId) return false;
    if (filters.status !== 'all' && o.status !== filters.status) return false;
    // Unstaffed means nobody is teaching it now, which is only a problem while
    // the course still expects to run.
    if (filters.unstaffedOnly && (o.instructors.length > 0 || o.status !== 'planned')) return false;
    if (!q) return true;
    return o.course.code.toLowerCase().includes(q)
      || o.course.title.toLowerCase().includes(q)
      || o.instructors.some((i) => i.full_name.toLowerCase().includes(q));
  });

  const cohorts = filters.programId
    ? sections.filter((s) => s.program.id === filters.programId)
    : sections;

  const groups = groupBySection(cohorts, matching);
  return isFiltering(filters) ? groups.filter((g) => g.offerings.length > 0) : groups;
}

/** Offerings that will block the start of teaching if nobody is assigned. */
export const unstaffedCount = (offerings: Offering[]): number =>
  offerings.filter((o) => o.status === 'planned' && o.instructors.length === 0).length;

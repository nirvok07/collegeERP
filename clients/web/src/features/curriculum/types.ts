export type VersionStatus = 'draft' | 'published' | 'superseded' | 'discarded';

export interface Program {
  id: string;
  name: string;
  code: string;
  award: string | null;
  department_id: string;
  department_name: string;
  duration_years: number;
  term_type: 'semester' | 'annual';
  status: 'active' | 'archived';
  published_versions: number;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: 'active' | 'archived';
  used_in_versions: number;
}

export interface CurriculumVersion {
  id: string;
  program_id: string;
  program_name: string;
  regulation_year: number;
  revision: number;
  title: string | null;
  status: VersionStatus;
  total_terms: number;
  published_at: string | null;
  superseded_by: string | null;
  course_count: number;
  total_credits: number;
  /** Stated by the server, never inferred, so no client offers an edit the database refuses. */
  editable: boolean;
}

export interface TermEntry {
  id: string;
  course_id: string;
  code: string;
  title: string;
  credits: number;
  requirement: 'core' | 'elective' | 'audit';
  elective_group: string | null;
}

export interface Term {
  term_number: number;
  courses: TermEntry[];
  credits: number;
}

export interface VersionDetail extends CurriculumVersion {
  terms: Term[];
}

/**
 * Why a version cannot be edited, in words a registrar would use.
 *
 * The button is not merely hidden: an administrator who cannot find the edit
 * action will look for a way around it, and the honest answer keeps them from
 * asking someone to change the database.
 */
export function readOnlyReason(version: CurriculumVersion): string | null {
  if (version.editable) return null;
  if (version.status === 'published') {
    return 'Published curricula cannot be changed. Students admitted under this regulation follow exactly these requirements, so correcting or changing it means creating a new version.';
  }
  if (version.status === 'superseded') {
    return 'This regulation has been superseded but still governs the students admitted under it, so it stays exactly as published.';
  }
  return 'This version cannot be edited.';
}

/** Terms with no courses. Publication is refused while any remain. */
export function emptyTerms(detail: VersionDetail): number[] {
  return detail.terms.filter((t) => t.courses.length === 0).map((t) => t.term_number);
}

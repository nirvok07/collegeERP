export type ComponentStatus = 'draft' | 'submitted' | 'verified' | 'cancelled';
export type ComponentKind = 'test' | 'quiz' | 'assignment' | 'lab' | 'project' | 'viva' | 'other';
/** Absent is not zero, and exempt is not absent. */
export type MarkStatus = 'scored' | 'absent' | 'exempt';

export const KINDS: ComponentKind[] = ['test', 'quiz', 'assignment', 'lab', 'project', 'viva', 'other'];
export const MARK_STATUSES: MarkStatus[] = ['scored', 'absent', 'exempt'];

export const KIND_LABEL: Record<ComponentKind, string> = {
  test: 'Test', quiz: 'Quiz', assignment: 'Assignment', lab: 'Lab record',
  project: 'Project', viva: 'Viva', other: 'Other',
};

export const STATUS_LABEL: Record<ComponentStatus, string> = {
  draft: 'Open', submitted: 'Awaiting verification', verified: 'Verified', cancelled: 'Cancelled',
};

export const MARK_LABEL: Record<MarkStatus, string> = {
  scored: 'Scored', absent: 'Absent', exempt: 'Exempt',
};

export interface AssessmentComponent {
  id: string;
  offering_id: string;
  name: string;
  kind: ComponentKind;
  max_marks: number;
  weight: number;
  held_on: string | null;
  status: ComponentStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  cancelled_reason: string | null;
  version: number;
  mark_count: number;
  course: { code: string; title: string };
  section: { id: string; label: string };
  program_name: string;
  term: { id: string; name: string };
  teacher: string | null;
}

export interface OfferingAssessments {
  weight_total: number;
  weight_remaining: number;
  components: AssessmentComponent[];
}

export interface SheetStudent {
  student_id: string;
  full_name: string;
  enrolment_number: string;
  student_status: string;
  mark_id: string | null;
  /** Null means nobody has recorded a result, which is not absent. */
  status: MarkStatus | null;
  score: number | null;
  note: string | null;
  marked_by: string | null;
  marked_at: string | null;
}

export interface SheetCorrection {
  id: string;
  mark_id: string;
  student_name: string;
  from_status: MarkStatus;
  from_score: number | null;
  to_status: MarkStatus;
  to_score: number | null;
  reason: string;
  corrected_by: string | null;
  corrected_at: string;
}

export interface Sheet {
  component: AssessmentComponent;
  needs_date: boolean;
  students: SheetStudent[];
  corrections: SheetCorrection[];
  summary: { scored: number; absent: number; exempt: number; marked: number; unmarked: number; total: number };
  /** Stated by the server, so the client never reimplements the rules. */
  can_plan: boolean;
  can_mark: boolean;
  can_submit: boolean;
  can_verify: boolean;
  can_correct: boolean;
}

/** A result as a reader would say it. */
export function resultLabel(status: MarkStatus | null, score: number | null): string {
  if (status === null) return 'Not entered';
  if (status === 'scored') return String(score);
  return MARK_LABEL[status];
}

/**
 * Parses what a person typed into a score field.
 *
 * Checked here so the field can say what is wrong as it is typed; the server
 * refuses the same values regardless, so this is guidance and never the rule.
 */
export function parseScore(
  raw: string, max: number,
): { ok: true; value: number } | { ok: false; error: string } {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Enter a score, or mark absent or exempt' };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: 'A score is a number with at most two decimal places' };
  }
  const value = Number(text);
  if (value > max) return { ok: false, error: `Out of ${max}` };
  return { ok: true, value };
}

/** Why a sheet cannot be submitted yet, in words rather than a dead button. */
export function submitBlockedReason(sheet: Sheet, unsaved: number): string | null {
  if (sheet.component.status !== 'draft') return `This sheet is ${STATUS_LABEL[sheet.component.status].toLowerCase()}.`;
  if (!sheet.can_submit) return 'You cannot submit this sheet.';
  if (sheet.needs_date) return 'Record when this assessment was held first.';
  if (unsaved > 0) return `Save your ${unsaved} unsaved ${unsaved === 1 ? 'change' : 'changes'} first.`;
  if (sheet.summary.unmarked > 0) {
    const n = sheet.summary.unmarked;
    return `${n} ${n === 1 ? 'student has' : 'students have'} no result yet.`;
  }
  return null;
}

/** How far along a component is, for a row in a list. */
export function progressOf(c: AssessmentComponent): string {
  if (c.status === 'cancelled') return 'Cancelled';
  if (c.status === 'verified') return `Verified${c.verified_by ? ` by ${c.verified_by}` : ''}`;
  if (c.status === 'submitted') return `Submitted${c.submitted_by ? ` by ${c.submitted_by}` : ''}`;
  if (!c.held_on) return 'Not held yet';
  return c.mark_count === 0 ? `Held ${c.held_on}, nothing entered` : `${c.mark_count} entered`;
}

/** Weight left to allocate, rounded as the server rounds it. */
export const weightLeft = (total: number): number => Math.max(0, Math.round((100 - total) * 100) / 100);

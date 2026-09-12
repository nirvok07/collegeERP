import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type ComponentStatus = 'draft' | 'submitted' | 'verified' | 'cancelled';
export type ComponentKind = 'test' | 'quiz' | 'assignment' | 'lab' | 'project' | 'viva' | 'other';
/** Absent is not zero and exempt is not absent. See the design, section 3. */
export type MarkStatus = 'scored' | 'absent' | 'exempt';

export interface ComponentRecord {
  id: string;
  offeringId: string;
  name: string;
  kind: ComponentKind;
  maxMarks: number;
  weight: number;
  /** When it was held. Null until recorded; the roster is taken as of it. */
  heldOn: string | null;
  status: ComponentStatus;
  submittedAt: Date | null;
  submittedByName: string | null;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  cancelledReason: string | null;
  version: number;
  markCount: number;
  courseCode: string;
  courseTitle: string;
  sectionId: string;
  sectionLabel: string;
  programName: string;
  termId: string;
  termName: string;
  teacherName: string | null;
}

export interface ComponentFilter {
  offeringId?: string | null;
  status?: ComponentStatus | null;
  sectionId?: string | null;
  /** The teacher's own: components of courses they hold a live assignment on. */
  minePersonId?: string | null;
}

export interface ComponentRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; name: string; kind: ComponentKind;
    maxMarks: number; weight: number; createdBy: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<ComponentRecord | null>;
  list(tx: Tx, filter: ComponentFilter): Promise<ComponentRecord[]>;
  revise(tx: Tx, input: {
    id: string; name: string; kind: ComponentKind; maxMarks: number; weight: number;
    expectedVersion: number;
  }): Promise<boolean>;
  setHeldOn(tx: Tx, input: { id: string; heldOn: string; expectedVersion: number }): Promise<boolean>;
  /**
   * Bumps the version, which is how a batch of marks claims the sheet. Fails on
   * a stale version, so a second client re-reads instead of overwriting.
   */
  touch(tx: Tx, input: { id: string; expectedVersion: number }): Promise<boolean>;
  submit(tx: Tx, input: { id: string; by: string; at: Date; expectedVersion: number }): Promise<boolean>;
  verify(tx: Tx, input: { id: string; by: string; at: Date; expectedVersion: number }): Promise<boolean>;
  cancel(tx: Tx, input: { id: string; reason: string; expectedVersion: number }): Promise<boolean>;
  /** Weight already claimed by a course's live components, for an honest form. */
  weightTotal(tx: Tx, offeringId: string): Promise<number>;
}

export interface AssessmentMarkRecord {
  id: string;
  studentId: string;
  status: MarkStatus;
  score: number | null;
  note: string | null;
  markedByName: string | null;
  markedAt: Date;
  version: number;
}

export interface AssessmentCorrectionRecord {
  id: string;
  markId: string;
  studentName: string;
  fromStatus: MarkStatus;
  fromScore: number | null;
  toStatus: MarkStatus;
  toScore: number | null;
  reason: string;
  correctedByName: string | null;
  correctedAt: Date;
}

export interface AssessmentMarkRepository {
  listForComponent(tx: Tx, componentId: string): Promise<AssessmentMarkRecord[]>;
  /** One statement for the whole sheet: sixty marks land together or not at all. */
  upsertMany(tx: Tx, input: {
    componentId: string; tenantId: string; markedBy: string; at: Date;
    marks: ReadonlyArray<{
      id: string; studentId: string; status: MarkStatus; score: number | null; note: string | null;
    }>;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<
    (AssessmentMarkRecord & { componentId: string; offeringId: string; sectionId: string }) | null
  >;
  /** Inserting the correction is what applies it; the trigger does the update. */
  correct(tx: Tx, input: {
    id: string; tenantId: string; markId: string;
    fromStatus: MarkStatus; fromScore: number | null;
    toStatus: MarkStatus; toScore: number | null;
    reason: string; correctedBy: string;
  }): Promise<void>;
  correctionsForComponent(tx: Tx, componentId: string): Promise<AssessmentCorrectionRecord[]>;
}

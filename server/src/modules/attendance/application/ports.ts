import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type AttendanceState = 'present' | 'absent' | 'late' | 'excused';
export type SheetStatus = 'draft' | 'submitted';

export interface SheetRecord {
  id: string;
  sessionId: string;
  status: SheetStatus;
  submittedAt: Date | null;
  submittedById: string | null;
  submittedByName: string | null;
  /** What a client must send back to change anything, so nobody overwrites. */
  version: number;
}

export interface MarkRecord {
  id: string;
  studentId: string;
  state: AttendanceState;
  note: string | null;
  markedById: string;
  markedByName: string | null;
  markedAt: Date;
  version: number;
}

export interface CorrectionRecord {
  id: string;
  recordId: string;
  studentId: string;
  studentName: string;
  fromState: AttendanceState;
  toState: AttendanceState;
  reason: string;
  correctedById: string;
  correctedByName: string | null;
  correctedAt: Date;
}

/** One session's register, for the overview that spans a day or a week. */
export interface SheetSummary {
  sessionId: string;
  sheetId: string | null;
  status: SheetStatus;
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number;
  submittedAt: Date | null;
}

export interface SheetRepository {
  findBySession(tx: Tx, sessionId: string): Promise<SheetRecord | null>;
  create(tx: Tx, input: {
    id: string; tenantId: string; sessionId: string; createdBy: string;
  }): Promise<void>;
  /**
   * Bumps the version, which is how a batch of marks claims the sheet. Fails
   * when the caller's version is stale, so a second client re-reads instead of
   * overwriting decisions it never saw.
   */
  touch(tx: Tx, input: { id: string; expectedVersion: number }): Promise<boolean>;
  submit(tx: Tx, input: {
    id: string; by: string; at: Date; expectedVersion: number;
  }): Promise<boolean>;
  summariesFor(tx: Tx, sessionIds: readonly string[]): Promise<SheetSummary[]>;
}

export interface MarkRepository {
  listForSheet(tx: Tx, sheetId: string): Promise<MarkRecord[]>;
  /**
   * One statement for the whole batch. Fifty marks either all land or none do,
   * and a classroom of sixty never becomes sixty requests.
   */
  upsertMany(tx: Tx, input: {
    sheetId: string; tenantId: string; markedBy: string; at: Date;
    marks: ReadonlyArray<{ id: string; studentId: string; state: AttendanceState; note: string | null }>;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<
    (MarkRecord & { sheetId: string; sessionId: string; sectionId: string; offeringId: string }) | null
  >;
  /**
   * Records a correction, which is also what applies it: the database trigger
   * on this insert updates the mark. Skipping the paper trail would mean not
   * making the change at all.
   */
  correct(tx: Tx, input: {
    id: string; tenantId: string; recordId: string; fromState: AttendanceState;
    toState: AttendanceState; reason: string; correctedBy: string;
  }): Promise<void>;
  correctionsForSheet(tx: Tx, sheetId: string): Promise<CorrectionRecord[]>;
}

/** SA-ATT-1: one person's one day, punched in and (once done) punched out. */
export interface StaffAttendanceRecord {
  id: string;
  workDate: string;
  punchInAt: Date;
  punchOutAt: Date | null;
}

export interface StaffAttendanceRepository {
  findCampusFence(tx: Tx, personId: string): Promise<{ campusName: string; latitude: number; longitude: number; radiusM: number } | null>;
  findByDate(tx: Tx, personId: string, workDate: string): Promise<StaffAttendanceRecord | null>;
  punchIn(tx: Tx, input: {
    id: string; tenantId: string; personId: string; workDate: string; at: Date;
    fenceVerified: boolean; accuracyM: number; source: 'app' | 'web' | 'biometric';
  }): Promise<StaffAttendanceRecord>;
  punchOut(tx: Tx, input: { id: string; at: Date }): Promise<void>;
  history(tx: Tx, personId: string, range: { from: string; to: string }): Promise<StaffAttendanceRecord[]>;
}

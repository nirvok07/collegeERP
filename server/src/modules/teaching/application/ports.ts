import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type SectionStatus = 'planned' | 'open' | 'active' | 'completed' | 'cancelled';

export interface AcademicYearRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  status: 'planned' | 'active' | 'closed' | 'archived';
  termCount: number;
}

export interface TermRecord {
  id: string;
  academicYearId: string;
  academicYearName: string;
  sequence: number;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'planned' | 'active' | 'closed' | 'archived';
}

export interface SectionRecord {
  id: string;
  programId: string;
  programName: string;
  programCode: string;
  departmentName: string;
  campusName: string;
  academicYearId: string;
  academicYearName: string;
  termId: string;
  termName: string;
  termNumber: number;
  label: string;
  capacity: number | null;
  status: SectionStatus;
  cancelledReason: string | null;
}

export interface AcademicYearRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; name: string; startsOn: string; endsOn: string;
    isCurrent: boolean;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<AcademicYearRecord | null>;
  list(tx: Tx): Promise<AcademicYearRecord[]>;
  /** Clears the flag elsewhere, so exactly one year is current. */
  clearCurrent(tx: Tx): Promise<void>;
  setCurrent(tx: Tx, id: string): Promise<boolean>;
  update(tx: Tx, id: string, input: { name: string; startsOn: string; endsOn: string }): Promise<boolean>;
  /** FB-2: removal is archival; nothing is ever deleted (bootstrap 001). */
  archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
}

export interface TermRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; academicYearId: string; sequence: number;
    name: string; startsOn: string; endsOn: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<TermRecord | null>;
  list(tx: Tx, academicYearId: string | null): Promise<TermRecord[]>;
  update(tx: Tx, id: string, input: { name: string; startsOn: string; endsOn: string }): Promise<boolean>;
  archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
}

export interface SectionFilter {
  academicYearId?: string | null;
  termId?: string | null;
  programId?: string | null;
  status?: SectionStatus | null;
}

export interface SectionRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; programId: string; academicYearId: string;
    termId: string; termNumber: number; label: string; capacity: number | null;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<SectionRecord | null>;
  list(tx: Tx, filter: SectionFilter): Promise<SectionRecord[]>;
  transition(tx: Tx, input: {
    id: string; from: SectionStatus; to: SectionStatus; at: Date; reason: string | null;
  }): Promise<boolean>;
  setCapacity(tx: Tx, id: string, capacity: number | null): Promise<boolean>;
}

/* ----------------------------------------------------------- offerings -- */

export type OfferingStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type OfferingComponent = 'lecture' | 'lab' | 'tutorial';
export type InstructorRole = 'lead' | 'co' | 'assistant';

export interface InstructorSummary {
  assignmentId: string;
  personId: string;
  fullName: string;
  role: InstructorRole;
  validFrom: Date;
}

export interface OfferingRecord {
  id: string;
  sectionId: string;
  sectionLabel: string;
  sectionStatus: SectionStatus;
  programId: string;
  programName: string;
  departmentName: string;
  termId: string;
  termName: string;
  academicYearName: string;
  termNumber: number;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  component: OfferingComponent;
  status: OfferingStatus;
  cancelledReason: string | null;
  /** Live assignments only. Ended ones are history, read separately. */
  instructors: InstructorSummary[];
}

export interface OfferingFilter {
  sectionId?: string | null;
  courseId?: string | null;
  termId?: string | null;
  programId?: string | null;
  status?: OfferingStatus | null;
  /** Offerings this person is currently assigned to teach. */
  instructorPersonId?: string | null;
  unstaffedOnly?: boolean;
}

export interface AssignmentHistoryRecord {
  id: string;
  personId: string;
  fullName: string;
  role: InstructorRole;
  validFrom: Date;
  validTo: Date | null;
  endReason: string | null;
}

export interface OfferingRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; sectionId: string; courseId: string;
    component: OfferingComponent;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<OfferingRecord | null>;
  list(tx: Tx, filter: OfferingFilter): Promise<OfferingRecord[]>;
  transition(tx: Tx, input: {
    id: string; from: OfferingStatus; to: OfferingStatus; at: Date; reason: string | null;
  }): Promise<boolean>;
  /** Used when a section completes: its active teaching ends with the term. */
  completeActiveForSection(tx: Tx, sectionId: string, at: Date): Promise<string[]>;
  listActiveForSection(tx: Tx, sectionId: string): Promise<OfferingRecord[]>;
}

export interface InstructorAssignmentRepository {
  assign(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; personId: string;
    role: InstructorRole; assignedBy: string; at: Date;
  }): Promise<void>;
  /** Ends an assignment rather than deleting it, so history survives. */
  end(tx: Tx, input: {
    id: string; endedBy: string; reason: string; at: Date;
  }): Promise<boolean>;
  findLive(tx: Tx, offeringId: string, personId: string): Promise<{ id: string; role: InstructorRole } | null>;
  findLiveById(tx: Tx, assignmentId: string): Promise<{ id: string; offeringId: string; personId: string; role: InstructorRole } | null>;
  history(tx: Tx, offeringId: string): Promise<AssignmentHistoryRecord[]>;
}

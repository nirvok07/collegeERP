import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type SectionStatus = 'planned' | 'open' | 'active' | 'completed' | 'cancelled';

export interface AcademicYearRecord {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  status: 'planned' | 'active' | 'closed';
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
  status: 'planned' | 'active' | 'closed';
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
}

export interface TermRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; academicYearId: string; sequence: number;
    name: string; startsOn: string; endsOn: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<TermRecord | null>;
  list(tx: Tx, academicYearId: string | null): Promise<TermRecord[]>;
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

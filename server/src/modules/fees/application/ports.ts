import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type FeeHeadStatus = 'active' | 'archived';

export interface FeeHeadRecord {
  id: string;
  name: string;
  code: string;
  status: FeeHeadStatus;
}

export interface FeeHeadRepository {
  create(tx: Tx, input: { id: string; tenantId: string; name: string; code: string }): Promise<void>;
  findById(tx: Tx, id: string): Promise<FeeHeadRecord | null>;
  findByCode(tx: Tx, code: string): Promise<FeeHeadRecord | null>;
  list(tx: Tx, includeArchived: boolean): Promise<FeeHeadRecord[]>;
  archive(tx: Tx, id: string): Promise<boolean>;
}

export type FeeStructureStatus = 'draft' | 'published' | 'superseded' | 'discarded';

export interface FeeStructureRecord {
  id: string;
  programId: string;
  programName: string;
  academicYearId: string;
  academicYearName: string;
  status: FeeStructureStatus;
  publishedAt: Date | null;
}

export interface FeeInstalmentRecord {
  id: string;
  structureId: string;
  seq: number;
  dueDate: string;
  lateFeePaise: number | null;
}

export interface FeeLineRecord {
  id: string;
  instalmentId: string;
  feeHeadId: string;
  feeHeadName: string;
  amountPaise: number;
}

export interface FeeStructureRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; programId: string; academicYearId: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<FeeStructureRecord | null>;
  /** The live (draft or published) structure for a program's year, if any. */
  findLive(tx: Tx, programId: string, academicYearId: string): Promise<FeeStructureRecord | null>;
  list(tx: Tx, programId: string | null): Promise<FeeStructureRecord[]>;
  publish(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
  discard(tx: Tx, id: string, at: Date): Promise<boolean>;

  listInstalments(tx: Tx, structureId: string): Promise<FeeInstalmentRecord[]>;
  findInstalment(tx: Tx, id: string): Promise<FeeInstalmentRecord | null>;
  addInstalment(tx: Tx, input: {
    id: string; tenantId: string; structureId: string; seq: number;
    dueDate: string; lateFeePaise: number | null;
  }): Promise<void>;

  listLines(tx: Tx, instalmentId: string): Promise<FeeLineRecord[]>;
  addLine(tx: Tx, input: {
    id: string; tenantId: string; instalmentId: string; feeHeadId: string; amountPaise: number;
  }): Promise<void>;
}

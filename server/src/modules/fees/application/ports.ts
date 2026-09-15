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

export type InvoiceStatus = 'due' | 'paid' | 'cancelled';

export interface InvoiceRecord {
  id: string;
  studentId: string;
  studentName: string;
  enrolmentNumber: string;
  feeStructureId: string;
  instalmentId: string;
  instalmentSeq: number;
  amountPaise: number;
  dueDate: string;
  status: InvoiceStatus;
}

export type FeeRequestKind = 'concession' | 'waiver';
export type FeeRequestStatus = 'requested' | 'approved' | 'rejected' | 'withdrawn';

export interface FeeRequestRecord {
  id: string;
  kind: FeeRequestKind;
  studentId: string;
  studentName: string;
  invoiceId: string;
  amountPaise: number;
  reason: string;
  status: FeeRequestStatus;
  requestedBy: string;
  requestedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
}

export interface FeeRequestRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; kind: FeeRequestKind; studentId: string; invoiceId: string;
    amountPaise: number; reason: string; requestedBy: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<FeeRequestRecord | null>;
  hasOpenRequest(tx: Tx, invoiceId: string): Promise<boolean>;
  decide(tx: Tx, input: {
    id: string; status: 'approved' | 'rejected'; decidedBy: string; decidedAt: Date; reason: string | null;
  }): Promise<boolean>;
  withdraw(tx: Tx, id: string, requestedBy: string): Promise<boolean>;
  list(tx: Tx, filter: { studentId?: string | null; status?: FeeRequestStatus | null }): Promise<FeeRequestRecord[]>;
}

export interface InvoiceRepository {
  /** Every currently enrolled student of a program (FEE-2 §4: a structure
   * is program + year only, so this is who it invoices). */
  enrolledStudentIds(tx: Tx, programId: string): Promise<string[]>;
  existsFor(tx: Tx, studentId: string, instalmentId: string): Promise<boolean>;
  create(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; feeStructureId: string;
    instalmentId: string; amountPaise: number; dueDate: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<InvoiceRecord | null>;
  listByStudent(tx: Tx, studentId: string): Promise<InvoiceRecord[]>;
  listByStructure(tx: Tx, structureId: string): Promise<InvoiceRecord[]>;
  /** A concession's effect (FEE-3): lowers what the invoice still asks for. */
  reduceAmount(tx: Tx, id: string, byPaise: number): Promise<boolean>;
}

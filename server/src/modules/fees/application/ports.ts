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

export type InvoiceKind = 'instalment' | 'fine' | 'late_fee';

export interface InvoiceRecord {
  id: string;
  studentId: string;
  studentName: string;
  enrolmentNumber: string;
  kind: InvoiceKind;
  feeStructureId: string | null;
  instalmentId: string | null;
  instalmentSeq: number | null;
  amountPaise: number;
  dueDate: string;
  status: InvoiceStatus;
  reason: string | null;
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

export interface StudentSummary {
  id: string;
  fullName: string;
  enrolmentNumber: string;
  programName: string;
}

export interface InvoiceRepository {
  /** Every currently enrolled student of a program (FEE-2 §4: a structure
   * is program + year only, so this is who it invoices). */
  enrolledStudentIds(tx: Tx, programId: string): Promise<string[]>;
  /** A Cashier or Accountant has no `student.read`; this is their own,
   * fee-scoped way to find who they are collecting from or fining. */
  searchStudents(tx: Tx, query: string): Promise<StudentSummary[]>;
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
  /** Due invoices for a student, oldest due date first — the allocation order (FEE-4 §6). */
  listDueByStudent(tx: Tx, studentId: string): Promise<InvoiceRecord[]>;
  markPaid(tx: Tx, id: string): Promise<boolean>;
  markDue(tx: Tx, id: string): Promise<boolean>;

  /** FEE-5: a fine, charged directly, due today. */
  createFine(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; amountPaise: number; reason: string; dueDate: string;
  }): Promise<void>;
  /** FEE-5: a late fee on one overdue instalment. */
  createLateFee(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; feeStructureId: string; instalmentId: string;
    amountPaise: number; reason: string; dueDate: string;
  }): Promise<void>;
  hasLateFee(tx: Tx, studentId: string, instalmentId: string): Promise<boolean>;
  /** Students still owing on this instalment's own invoice, for late-fee application. */
  studentsStillDue(tx: Tx, instalmentId: string): Promise<string[]>;
}

export type PaymentMethod = 'cash' | 'upi' | 'cheque' | 'bank_transfer';
export type PaymentKind = 'payment' | 'reversal';

export interface PaymentRecord {
  id: string;
  studentId: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amountPaise: number;
  reference: string | null;
  reversesPaymentId: string | null;
  reason: string | null;
  receivedBy: string;
  receivedAt: Date;
}

export interface AllocationRecord {
  invoiceId: string;
  amountPaise: number;
}

export interface ReceiptRecord {
  id: string;
  paymentId: string;
  receiptNumber: number;
  status: 'issued' | 'cancelled';
  issuedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface PaymentRepository {
  nextReceiptNumber(tx: Tx, tenantId: string): Promise<number>;
  createPayment(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; kind: PaymentKind; method: PaymentMethod;
    amountPaise: number; reference: string | null; reversesPaymentId: string | null;
    reason: string | null; receivedBy: string;
  }): Promise<void>;
  findPayment(tx: Tx, id: string): Promise<PaymentRecord | null>;
  reversalOf(tx: Tx, paymentId: string): Promise<PaymentRecord | null>;
  addAllocation(tx: Tx, input: {
    id: string; tenantId: string; paymentId: string; invoiceId: string; amountPaise: number;
  }): Promise<void>;
  allocationsFor(tx: Tx, paymentId: string): Promise<AllocationRecord[]>;
  /** Net paid so far on one invoice: payments minus reversals allocated to it. */
  netPaidOnInvoice(tx: Tx, invoiceId: string): Promise<number>;

  createReceipt(tx: Tx, input: { id: string; tenantId: string; paymentId: string; receiptNumber: number }): Promise<void>;
  findReceiptByPayment(tx: Tx, paymentId: string): Promise<ReceiptRecord | null>;
  cancelReceipt(tx: Tx, input: {
    paymentId: string; cancelledBy: string; cancelledAt: Date; reason: string;
  }): Promise<boolean>;
  listByStudent(tx: Tx, studentId: string): Promise<PaymentRecord[]>;
}

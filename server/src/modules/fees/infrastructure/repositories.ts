import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  AllocationRecord, CollectionRow, FeeHeadRecord, FeeHeadRepository, FeeInstalmentRecord, FeeLineRecord,
  FeeReportsRepository, FeeRequestRecord, FeeRequestRepository, FeeStructureRecord, FeeStructureRepository,
  InvoiceRecord, InvoiceRepository, OnlineIntentRecord, OnlineIntentRepository, OutstandingRow, PaymentRecord,
  PaymentRepository, ReceiptRecord, RequestRegisterRow, StudentSummary,
} from '../application/ports.ts';

function toHead(r: any): FeeHeadRecord {
  return { id: r.id, name: r.name, code: r.code, status: r.status };
}

export class PgFeeHeadRepository implements FeeHeadRepository {
  async create(tx: Tx, input: { id: string; tenantId: string; name: string; code: string }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_heads (id, tenant_id, name, code) VALUES ($1,$2,$3,$4)`,
      [input.id, input.tenantId, input.name, input.code],
    );
  }

  async findById(tx: Tx, id: string): Promise<FeeHeadRecord | null> {
    const { rows } = await clientOf(tx).query(`SELECT id, name, code, status FROM fee_heads WHERE id=$1`, [id]);
    return rows[0] ? toHead(rows[0]) : null;
  }

  async findByCode(tx: Tx, code: string): Promise<FeeHeadRecord | null> {
    const { rows } = await clientOf(tx).query(`SELECT id, name, code, status FROM fee_heads WHERE code=$1`, [code]);
    return rows[0] ? toHead(rows[0]) : null;
  }

  async list(tx: Tx, includeArchived: boolean): Promise<FeeHeadRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, name, code, status FROM fee_heads WHERE ($1::boolean OR status='active') ORDER BY name`,
      [includeArchived],
    );
    return rows.map(toHead);
  }

  async archive(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_heads SET status='archived', updated_at=now(), version=version+1 WHERE id=$1 AND status='active'`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

const STRUCTURE_SELECT = `
  SELECT s.id, s.program_id, p.name AS program_name, s.academic_year_id, y.name AS academic_year_name,
         s.status, s.published_at
    FROM fee_structures s
    JOIN programs p ON p.id = s.program_id
    JOIN academic_years y ON y.id = s.academic_year_id`;

function toStructure(r: any): FeeStructureRecord {
  return {
    id: r.id, programId: r.program_id, programName: r.program_name,
    academicYearId: r.academic_year_id, academicYearName: r.academic_year_name,
    status: r.status, publishedAt: r.published_at,
  };
}

function toInstalment(r: any): FeeInstalmentRecord {
  return {
    id: r.id, structureId: r.structure_id, seq: r.seq, dueDate: `${r.due_date}`,
    lateFeePaise: r.late_fee_paise === null ? null : Number(r.late_fee_paise),
  };
}

function toLine(r: any): FeeLineRecord {
  return {
    id: r.id, instalmentId: r.instalment_id, feeHeadId: r.fee_head_id,
    feeHeadName: r.fee_head_name, amountPaise: Number(r.amount_paise),
  };
}

export class PgFeeStructureRepository implements FeeStructureRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; programId: string; academicYearId: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_structures (id, tenant_id, program_id, academic_year_id) VALUES ($1,$2,$3,$4)`,
      [input.id, input.tenantId, input.programId, input.academicYearId],
    );
  }

  async findById(tx: Tx, id: string): Promise<FeeStructureRecord | null> {
    const { rows } = await clientOf(tx).query(`${STRUCTURE_SELECT} WHERE s.id=$1`, [id]);
    return rows[0] ? toStructure(rows[0]) : null;
  }

  async findLive(tx: Tx, programId: string, academicYearId: string): Promise<FeeStructureRecord | null> {
    const { rows } = await clientOf(tx).query(
      `${STRUCTURE_SELECT} WHERE s.program_id=$1 AND s.academic_year_id=$2 AND s.status IN ('draft','published')`,
      [programId, academicYearId],
    );
    return rows[0] ? toStructure(rows[0]) : null;
  }

  async list(tx: Tx, programId: string | null): Promise<FeeStructureRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${STRUCTURE_SELECT} WHERE ($1::uuid IS NULL OR s.program_id=$1) AND s.status <> 'discarded'
        ORDER BY y.starts_on DESC, p.name`,
      [programId],
    );
    return rows.map(toStructure);
  }

  async publish(tx: Tx, id: string, by: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_structures SET status='published', published_at=$2, published_by=$3,
              updated_at=now(), version=version+1
        WHERE id=$1 AND status='draft'`,
      [id, at, by],
    );
    return (rowCount ?? 0) > 0;
  }

  async discard(tx: Tx, id: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_structures SET status='discarded', discarded_at=$2, updated_at=now(), version=version+1
        WHERE id=$1 AND status IN ('draft','published')`,
      [id, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async listInstalments(tx: Tx, structureId: string): Promise<FeeInstalmentRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, structure_id, seq, due_date, late_fee_paise FROM fee_structure_instalments
        WHERE structure_id=$1 ORDER BY seq`,
      [structureId],
    );
    return rows.map(toInstalment);
  }

  async findInstalment(tx: Tx, id: string): Promise<FeeInstalmentRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, structure_id, seq, due_date, late_fee_paise FROM fee_structure_instalments WHERE id=$1`,
      [id],
    );
    return rows[0] ? toInstalment(rows[0]) : null;
  }

  async addInstalment(tx: Tx, input: {
    id: string; tenantId: string; structureId: string; seq: number;
    dueDate: string; lateFeePaise: number | null;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_structure_instalments (id, tenant_id, structure_id, seq, due_date, late_fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.tenantId, input.structureId, input.seq, input.dueDate, input.lateFeePaise],
    );
  }

  async listLines(tx: Tx, instalmentId: string): Promise<FeeLineRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT l.id, l.instalment_id, l.fee_head_id, h.name AS fee_head_name, l.amount_paise
         FROM fee_structure_lines l JOIN fee_heads h ON h.id = l.fee_head_id
        WHERE l.instalment_id=$1 ORDER BY h.name`,
      [instalmentId],
    );
    return rows.map(toLine);
  }

  async addLine(tx: Tx, input: {
    id: string; tenantId: string; instalmentId: string; feeHeadId: string; amountPaise: number;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_structure_lines (id, tenant_id, instalment_id, fee_head_id, amount_paise)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.tenantId, input.instalmentId, input.feeHeadId, input.amountPaise],
    );
  }
}

const INVOICE_SELECT = `
  SELECT i.id, i.student_id, per.full_name AS student_name, s.enrolment_number,
         i.kind, i.fee_structure_id, i.instalment_id, fsi.seq AS instalment_seq,
         i.amount_paise, i.due_date, i.status, i.reason
    FROM invoices i
    JOIN students s ON s.id = i.student_id
    JOIN persons per ON per.id = s.person_id
    LEFT JOIN fee_structure_instalments fsi ON fsi.id = i.instalment_id`;

function toInvoice(r: any): InvoiceRecord {
  return {
    id: r.id, studentId: r.student_id, studentName: r.student_name, enrolmentNumber: r.enrolment_number,
    kind: r.kind, feeStructureId: r.fee_structure_id, instalmentId: r.instalment_id,
    instalmentSeq: r.instalment_seq === null ? null : Number(r.instalment_seq),
    amountPaise: Number(r.amount_paise), dueDate: `${r.due_date}`, status: r.status, reason: r.reason,
  };
}

export class PgInvoiceRepository implements InvoiceRepository {
  async enrolledStudentIds(tx: Tx, programId: string): Promise<string[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id FROM students WHERE program_id=$1 AND status='enrolled'`,
      [programId],
    );
    return rows.map((r: any) => r.id);
  }

  async searchStudents(tx: Tx, query: string): Promise<StudentSummary[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT s.id, per.full_name, s.enrolment_number, p.name AS program_name
         FROM students s
         JOIN persons per ON per.id = s.person_id
         JOIN programs p ON p.id = s.program_id
        WHERE s.status = 'enrolled'
          AND (per.full_name ILIKE '%' || $1 || '%' OR s.enrolment_number ILIKE '%' || $1 || '%')
        ORDER BY per.full_name LIMIT 20`,
      [query],
    );
    return rows.map((r: any) => ({
      id: r.id, fullName: r.full_name, enrolmentNumber: r.enrolment_number, programName: r.program_name,
    }));
  }

  async existsFor(tx: Tx, studentId: string, instalmentId: string): Promise<boolean> {
    const { rows } = await clientOf(tx).query(
      `SELECT 1 FROM invoices WHERE student_id=$1 AND instalment_id=$2`,
      [studentId, instalmentId],
    );
    return rows.length > 0;
  }

  async create(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; feeStructureId: string;
    instalmentId: string; amountPaise: number; dueDate: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO invoices (id, tenant_id, student_id, fee_structure_id, instalment_id, amount_paise, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.studentId, input.feeStructureId,
       input.instalmentId, input.amountPaise, input.dueDate],
    );
  }

  async listByStudent(tx: Tx, studentId: string): Promise<InvoiceRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${INVOICE_SELECT} WHERE i.student_id=$1 ORDER BY i.due_date`,
      [studentId],
    );
    return rows.map(toInvoice);
  }

  async listByStructure(tx: Tx, structureId: string): Promise<InvoiceRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${INVOICE_SELECT} WHERE i.fee_structure_id=$1 ORDER BY per.full_name, i.due_date`,
      [structureId],
    );
    return rows.map(toInvoice);
  }

  async findById(tx: Tx, id: string): Promise<InvoiceRecord | null> {
    const { rows } = await clientOf(tx).query(`${INVOICE_SELECT} WHERE i.id=$1`, [id]);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async reduceAmount(tx: Tx, id: string, byPaise: number): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE invoices SET amount_paise = amount_paise - $2, updated_at=now(), version=version+1
        WHERE id=$1 AND status='due' AND amount_paise >= $2`,
      [id, byPaise],
    );
    return (rowCount ?? 0) > 0;
  }

  async listDueByStudent(tx: Tx, studentId: string): Promise<InvoiceRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${INVOICE_SELECT} WHERE i.student_id=$1 AND i.status='due' ORDER BY i.due_date`,
      [studentId],
    );
    return rows.map(toInvoice);
  }

  async markPaid(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE invoices SET status='paid', updated_at=now(), version=version+1 WHERE id=$1 AND status='due'`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async markDue(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE invoices SET status='due', updated_at=now(), version=version+1 WHERE id=$1 AND status='paid'`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async createFine(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; amountPaise: number; reason: string; dueDate: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO invoices (id, tenant_id, student_id, kind, amount_paise, due_date, reason)
       VALUES ($1,$2,$3,'fine',$4,$5,$6)`,
      [input.id, input.tenantId, input.studentId, input.amountPaise, input.dueDate, input.reason],
    );
  }

  async createLateFee(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; feeStructureId: string; instalmentId: string;
    amountPaise: number; reason: string; dueDate: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO invoices (id, tenant_id, student_id, kind, fee_structure_id, instalment_id, amount_paise, due_date, reason)
       VALUES ($1,$2,$3,'late_fee',$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.studentId, input.feeStructureId, input.instalmentId,
       input.amountPaise, input.dueDate, input.reason],
    );
  }

  async hasLateFee(tx: Tx, studentId: string, instalmentId: string): Promise<boolean> {
    const { rows } = await clientOf(tx).query(
      `SELECT 1 FROM invoices WHERE student_id=$1 AND instalment_id=$2 AND kind='late_fee'`,
      [studentId, instalmentId],
    );
    return rows.length > 0;
  }

  async studentsStillDue(tx: Tx, instalmentId: string): Promise<string[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT student_id FROM invoices WHERE instalment_id=$1 AND kind='instalment' AND status='due'`,
      [instalmentId],
    );
    return rows.map((r: any) => r.student_id);
  }
}

function toFeeRequest(r: any): FeeRequestRecord {
  return {
    id: r.id, kind: r.kind, studentId: r.student_id, studentName: r.student_name,
    invoiceId: r.invoice_id, amountPaise: Number(r.amount_paise), reason: r.reason, status: r.status,
    requestedBy: r.requested_by, requestedAt: r.requested_at,
    decidedBy: r.decided_by, decidedAt: r.decided_at, decisionReason: r.decision_reason,
  };
}

const FEE_REQUEST_SELECT = `
  SELECT r.id, r.kind, r.student_id, per.full_name AS student_name, r.invoice_id, r.amount_paise,
         r.reason, r.status, r.requested_by, r.requested_at, r.decided_by, r.decided_at, r.decision_reason
    FROM fee_requests r
    JOIN students s ON s.id = r.student_id
    JOIN persons per ON per.id = s.person_id`;

export class PgFeeRequestRepository implements FeeRequestRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; kind: string; studentId: string; invoiceId: string;
    amountPaise: number; reason: string; requestedBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_requests (id, tenant_id, kind, student_id, invoice_id, amount_paise, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.kind, input.studentId, input.invoiceId,
       input.amountPaise, input.reason, input.requestedBy],
    );
  }

  async findById(tx: Tx, id: string): Promise<FeeRequestRecord | null> {
    const { rows } = await clientOf(tx).query(`${FEE_REQUEST_SELECT} WHERE r.id=$1`, [id]);
    return rows[0] ? toFeeRequest(rows[0]) : null;
  }

  async hasOpenRequest(tx: Tx, invoiceId: string): Promise<boolean> {
    const { rows } = await clientOf(tx).query(
      `SELECT 1 FROM fee_requests WHERE invoice_id=$1 AND status='requested'`,
      [invoiceId],
    );
    return rows.length > 0;
  }

  async decide(tx: Tx, input: {
    id: string; status: string; decidedBy: string; decidedAt: Date; reason: string | null;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_requests SET status=$2, decided_by=$3, decided_at=$4, decision_reason=$5,
              updated_at=now(), version=version+1
        WHERE id=$1 AND status='requested'`,
      [input.id, input.status, input.decidedBy, input.decidedAt, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }

  async withdraw(tx: Tx, id: string, requestedBy: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_requests SET status='withdrawn', updated_at=now(), version=version+1
        WHERE id=$1 AND status='requested' AND requested_by=$2`,
      [id, requestedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async list(tx: Tx, filter: { studentId?: string | null; status?: string | null }): Promise<FeeRequestRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${FEE_REQUEST_SELECT}
        WHERE ($1::uuid IS NULL OR r.student_id=$1) AND ($2::text IS NULL OR r.status=$2)
        ORDER BY r.requested_at DESC`,
      [filter.studentId ?? null, filter.status ?? null],
    );
    return rows.map(toFeeRequest);
  }
}

function toPayment(r: any): PaymentRecord {
  return {
    id: r.id, studentId: r.student_id, kind: r.kind, method: r.method, amountPaise: Number(r.amount_paise),
    reference: r.reference, reversesPaymentId: r.reverses_payment_id, reason: r.reason,
    receivedBy: r.received_by, receivedAt: r.received_at,
    receiptNumber: r.receipt_number == null ? null : Number(r.receipt_number),
    receiptStatus: r.receipt_status, receiptIssuedAt: r.receipt_issued_at,
  };
}

function toReceipt(r: any): ReceiptRecord {
  return {
    id: r.id, paymentId: r.payment_id, receiptNumber: Number(r.receipt_number), status: r.status,
    issuedAt: r.issued_at, cancelledAt: r.cancelled_at, cancellationReason: r.cancellation_reason,
  };
}

// G1 (receipt/statement): a payment's receipt travels with it everywhere a
// payment is read, so a screen never has to fetch it separately — a reversal
// has none (module doc §6: "gets no receipt of its own"), which the LEFT
// JOIN leaves null rather than absent.
const PAYMENT_SELECT = `
  SELECT p.id, p.student_id, p.kind, p.method, p.amount_paise, p.reference, p.reverses_payment_id,
         p.reason, p.received_by, p.received_at,
         r.receipt_number, r.status AS receipt_status, r.issued_at AS receipt_issued_at
    FROM payments p
    LEFT JOIN receipts r ON r.payment_id = p.id`;

export class PgPaymentRepository implements PaymentRepository {
  async nextReceiptNumber(tx: Tx, tenantId: string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO fee_receipt_counters (tenant_id, next_number) VALUES ($1, 2)
       ON CONFLICT (tenant_id) DO UPDATE SET next_number = fee_receipt_counters.next_number + 1
       RETURNING next_number - 1 AS number`,
      [tenantId],
    );
    return Number(rows[0].number);
  }

  async createPayment(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; kind: string; method: string;
    amountPaise: number; reference: string | null; reversesPaymentId: string | null;
    reason: string | null; receivedBy: string | null;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO payments
         (id, tenant_id, student_id, kind, method, amount_paise, reference, reverses_payment_id, reason, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [input.id, input.tenantId, input.studentId, input.kind, input.method, input.amountPaise,
       input.reference, input.reversesPaymentId, input.reason, input.receivedBy],
    );
  }

  async findPayment(tx: Tx, id: string): Promise<PaymentRecord | null> {
    const { rows } = await clientOf(tx).query(`${PAYMENT_SELECT} WHERE p.id=$1`, [id]);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async reversalOf(tx: Tx, paymentId: string): Promise<PaymentRecord | null> {
    const { rows } = await clientOf(tx).query(`${PAYMENT_SELECT} WHERE p.reverses_payment_id=$1`, [paymentId]);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async addAllocation(tx: Tx, input: {
    id: string; tenantId: string; paymentId: string; invoiceId: string; amountPaise: number;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO payment_allocations (id, tenant_id, payment_id, invoice_id, amount_paise)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.tenantId, input.paymentId, input.invoiceId, input.amountPaise],
    );
  }

  async allocationsFor(tx: Tx, paymentId: string): Promise<AllocationRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT invoice_id, amount_paise FROM payment_allocations WHERE payment_id=$1`,
      [paymentId],
    );
    return rows.map((r: any) => ({ invoiceId: r.invoice_id, amountPaise: Number(r.amount_paise) }));
  }

  async netPaidOnInvoice(tx: Tx, invoiceId: string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `SELECT coalesce(sum(
                CASE WHEN p.kind = 'payment' THEN a.amount_paise ELSE -a.amount_paise END
              ), 0) AS net
         FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
        WHERE a.invoice_id = $1`,
      [invoiceId],
    );
    return Number(rows[0].net);
  }

  async createReceipt(tx: Tx, input: {
    id: string; tenantId: string; paymentId: string; receiptNumber: number;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO receipts (id, tenant_id, payment_id, receipt_number) VALUES ($1,$2,$3,$4)`,
      [input.id, input.tenantId, input.paymentId, input.receiptNumber],
    );
  }

  async findReceiptByPayment(tx: Tx, paymentId: string): Promise<ReceiptRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, payment_id, receipt_number, status, issued_at, cancelled_at, cancellation_reason
         FROM receipts WHERE payment_id=$1`,
      [paymentId],
    );
    return rows[0] ? toReceipt(rows[0]) : null;
  }

  async cancelReceipt(tx: Tx, input: {
    paymentId: string; cancelledBy: string; cancelledAt: Date; reason: string;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE receipts SET status='cancelled', cancelled_at=$2, cancelled_by=$3, cancellation_reason=$4,
              updated_at=now(), version=version+1
        WHERE payment_id=$1 AND status='issued'`,
      [input.paymentId, input.cancelledAt, input.cancelledBy, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }

  async listByStudent(tx: Tx, studentId: string): Promise<PaymentRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${PAYMENT_SELECT} WHERE p.student_id=$1 ORDER BY p.received_at DESC`,
      [studentId],
    );
    return rows.map(toPayment);
  }
}


function toOnlineIntent(r: any): OnlineIntentRecord {
  return {
    id: r.id, studentId: r.student_id, amountPaise: Number(r.amount_paise), status: r.status,
    provider: r.provider, providerRef: r.provider_ref, paymentId: r.payment_id,
    createdBy: r.created_by, createdAt: r.created_at, completedAt: r.completed_at,
  };
}

const ONLINE_INTENT_SELECT = `
  SELECT id, student_id, amount_paise, status, provider, provider_ref, payment_id,
         created_by, created_at, completed_at
    FROM fee_online_intents`;

/** FEE-7: the dummy-gateway-today, real-gateway-later online payment intent. */
export class PgOnlineIntentRepository implements OnlineIntentRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; amountPaise: number;
    provider: string; providerRef: string | null; createdBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_online_intents (id, tenant_id, student_id, amount_paise, provider, provider_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.studentId, input.amountPaise, input.provider, input.providerRef, input.createdBy],
    );
  }

  async find(tx: Tx, id: string): Promise<OnlineIntentRecord | null> {
    const { rows } = await clientOf(tx).query(`${ONLINE_INTENT_SELECT} WHERE id=$1`, [id]);
    return rows[0] ? toOnlineIntent(rows[0]) : null;
  }

  async complete(tx: Tx, input: {
    id: string; status: 'paid' | 'failed'; paymentId: string | null; completedAt: Date;
  }): Promise<boolean> {
    // Only a 'created' intent may complete, and only once — guards a retried
    // or doubled "webhook" call from completing the same intent twice.
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_online_intents SET status=$2, payment_id=$3, completed_at=$4, version=version+1
        WHERE id=$1 AND status='created'`,
      [input.id, input.status, input.paymentId, input.completedAt],
    );
    return (rowCount ?? 0) > 0;
  }
}

/**
 * G2: reports read against the ledger the module already keeps — no new
 * tables, no new invariant (R73, the M11 Student Finance contract).
 */
export class PgFeeReportsRepository implements FeeReportsRepository {
  // Dates here are UTC-normalized, the same convention `todayIso` in
  // manage-fees.ts uses for due-date comparisons — independent of whatever
  // timezone the DB session happens to run in.
  async collection(tx: Tx, from: string, to: string): Promise<CollectionRow[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT to_char(p.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
              p.received_by, per.full_name AS received_by_name, p.method, p.kind,
              SUM(CASE WHEN p.kind = 'payment' THEN p.amount_paise ELSE -p.amount_paise END) AS amount_paise
         FROM payments p
         LEFT JOIN persons per ON per.id = p.received_by
        WHERE (p.received_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
        GROUP BY date, p.received_by, per.full_name, p.method, p.kind
        ORDER BY date, received_by_name NULLS FIRST, p.method, p.kind`,
      [from, to],
    );
    return rows.map((r: any) => ({
      date: r.date, receivedBy: r.received_by, receivedByName: r.received_by_name,
      method: r.method, kind: r.kind, amountPaise: Number(r.amount_paise),
    }));
  }

  async outstanding(tx: Tx, asOf: string): Promise<OutstandingRow[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT i.id AS invoice_id, i.student_id, per.full_name AS student_name, s.enrolment_number,
              i.kind, i.due_date, i.amount_paise - coalesce(alloc.net, 0) AS outstanding_paise,
              greatest(0, $1::date - i.due_date) AS overdue_days
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         JOIN persons per ON per.id = s.person_id
         LEFT JOIN (
           SELECT a.invoice_id,
                  SUM(CASE WHEN p.kind = 'payment' THEN a.amount_paise ELSE -a.amount_paise END) AS net
             FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
            GROUP BY a.invoice_id
         ) alloc ON alloc.invoice_id = i.id
        WHERE i.status = 'due'
        ORDER BY i.due_date, per.full_name`,
      [asOf],
    );
    return rows.map((r: any) => ({
      invoiceId: r.invoice_id, studentId: r.student_id, studentName: r.student_name,
      enrolmentNumber: r.enrolment_number, kind: r.kind, dueDate: `${r.due_date}`,
      outstandingPaise: Number(r.outstanding_paise), overdueDays: Number(r.overdue_days),
    }));
  }

  async requestsRegister(tx: Tx, filter: { from: string | null; to: string | null }): Promise<RequestRegisterRow[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT r.id, r.kind, r.student_id, per.full_name AS student_name, r.invoice_id, r.amount_paise,
              r.reason, r.status, r.requested_by, reqp.full_name AS requested_by_name, r.requested_at,
              r.decided_by, decp.full_name AS decided_by_name, r.decided_at, r.decision_reason
         FROM fee_requests r
         JOIN students s ON s.id = r.student_id
         JOIN persons per ON per.id = s.person_id
         JOIN persons reqp ON reqp.id = r.requested_by
         LEFT JOIN persons decp ON decp.id = r.decided_by
        WHERE ($1::date IS NULL OR r.requested_at >= $1::date)
          AND ($2::date IS NULL OR r.requested_at < $2::date + interval '1 day')
        ORDER BY r.requested_at DESC`,
      [filter.from, filter.to],
    );
    return rows.map((r: any) => ({
      id: r.id, kind: r.kind, studentId: r.student_id, studentName: r.student_name, invoiceId: r.invoice_id,
      amountPaise: Number(r.amount_paise), reason: r.reason, status: r.status,
      requestedBy: r.requested_by, requestedByName: r.requested_by_name, requestedAt: r.requested_at,
      decidedBy: r.decided_by, decidedByName: r.decided_by_name,
      decidedAt: r.decided_at, decisionReason: r.decision_reason,
    }));
  }
}

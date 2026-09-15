/**
 * M11 Student Finance, FEE-1: fee heads and structures.
 *
 * See docs/blueprint/modules/m11-student-finance.md for the module contract.
 * This slice only lets the Accountant define what a program's students owe
 * for an academic year. No invoices, no payments, no money has moved yet.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  FeeHeadRepository, FeeInstalmentRecord, FeeLineRecord, FeeRequestRecord, FeeRequestRepository,
  FeeStructureRepository, InvoiceRecord, InvoiceRepository, PaymentMethod, PaymentRecord,
  PaymentRepository, ReceiptRecord,
} from './ports.ts';

export interface FeesActor {
  tenantId: string;
  personId: string;
}

export interface FeesDeps {
  uow: UnitOfWork;
  feeHeads: FeeHeadRepository;
  structures: FeeStructureRepository;
  invoices: InvoiceRepository;
  requests: FeeRequestRepository;
  payments: PaymentRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/** A calendar date for today, in UTC, matching how every date here is stored. */
const todayIso = (clock: Clock) => clock.now().toISOString().slice(0, 10);

async function attempt<T>(run: () => Promise<Result<T>>, fallback: string): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message || fallback));
    throw e;
  }
}

/* ----------------------------------------------------------------- heads */

export async function createFeeHead(
  deps: FeesDeps, actor: FeesActor, input: { name: string; code: string },
): Promise<Result<{ id: string }>> {
  const code = input.code.trim().toUpperCase();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const existing = await deps.feeHeads.findByCode(tx, code);
    if (existing) return Err(fail('CONFLICT', `A fee head with the code ${code} already exists.`));

    const id = deps.ids.next();
    await deps.feeHeads.create(tx, { id, tenantId: actor.tenantId, name: input.name.trim(), code });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.head_created', subjectType: 'fee_head', subjectId: id,
      after: { name: input.name.trim(), code },
    }, tx);
    return Ok({ id });
  }), 'That fee head could not be created.');
}

export async function listFeeHeads(deps: FeesDeps, actor: FeesActor, includeArchived: boolean) {
  return deps.uow.run(actor.tenantId, (tx) => deps.feeHeads.list(tx, includeArchived));
}

export async function archiveFeeHead(
  deps: FeesDeps, actor: FeesActor, id: string,
): Promise<Result<{ archived: true }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const archived = await deps.feeHeads.archive(tx, id);
    if (!archived) return Err(fail('NOT_FOUND', 'That fee head was not found, or is already archived.'));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.head_archived', subjectType: 'fee_head', subjectId: id,
    }, tx);
    return Ok({ archived: true as const });
  });
}

/* ------------------------------------------------------------ structures */

export async function createDraftStructure(
  deps: FeesDeps, actor: FeesActor, input: { programId: string; academicYearId: string },
): Promise<Result<{ id: string }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const live = await deps.structures.findLive(tx, input.programId, input.academicYearId);
    if (live) {
      return Err(fail('CONFLICT',
        live.status === 'published'
          ? 'A fee structure is already published for this program and year. Discard it first, or edit it as a new revision once revisions exist.'
          : 'A draft fee structure already exists for this program and year.'));
    }

    const id = deps.ids.next();
    await deps.structures.create(tx, {
      id, tenantId: actor.tenantId, programId: input.programId, academicYearId: input.academicYearId,
    });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.structure_drafted', subjectType: 'fee_structure', subjectId: id,
      after: { programId: input.programId, academicYearId: input.academicYearId },
    }, tx);
    return Ok({ id });
  }), 'That fee structure could not be created.');
}

/** A draft's own structure, or the reason nothing may be added to it. */
async function draftStructure(deps: FeesDeps, tx: Tx, structureId: string): Promise<Result<null>> {
  const structure = await deps.structures.findById(tx, structureId);
  if (!structure) return Err(fail('NOT_FOUND', 'That fee structure was not found.'));
  if (structure.status !== 'draft') {
    return Err(fail('CONFLICT', `This fee structure is already ${structure.status}. Only a draft can be changed.`));
  }
  return Ok(null);
}

export async function addInstalment(
  deps: FeesDeps, actor: FeesActor,
  input: { structureId: string; seq: number; dueDate: string; lateFeePaise: number | null },
): Promise<Result<{ id: string }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const checked = await draftStructure(deps, tx, input.structureId);
    if (!checked.ok) return Err(checked.error);

    const id = deps.ids.next();
    await deps.structures.addInstalment(tx, {
      id, tenantId: actor.tenantId, structureId: input.structureId, seq: input.seq,
      dueDate: input.dueDate, lateFeePaise: input.lateFeePaise,
    });
    return Ok({ id });
  }), 'That instalment could not be added.');
}

export async function addLine(
  deps: FeesDeps, actor: FeesActor,
  input: { instalmentId: string; feeHeadId: string; amountPaise: number },
): Promise<Result<{ id: string }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const instalment = await deps.structures.findInstalment(tx, input.instalmentId);
    if (!instalment) return Err(fail('NOT_FOUND', 'That instalment was not found.'));
    // The instalment's own structure must still be a draft: once published,
    // nothing about what a student owes for a term already invoiced changes.
    const checked = await draftStructure(deps, tx, instalment.structureId);
    if (!checked.ok) return Err(checked.error);

    const id = deps.ids.next();
    await deps.structures.addLine(tx, {
      id, tenantId: actor.tenantId, instalmentId: input.instalmentId,
      feeHeadId: input.feeHeadId, amountPaise: input.amountPaise,
    });
    return Ok({ id });
  }), 'That fee line could not be added.');
}

export interface FeeStructureDetail {
  id: string;
  programId: string;
  programName: string;
  academicYearId: string;
  academicYearName: string;
  status: string;
  publishedAt: Date | null;
  instalments: (FeeInstalmentRecord & { lines: FeeLineRecord[] })[];
  totalPaise: number;
}

export async function readStructure(
  deps: FeesDeps, actor: FeesActor, id: string,
): Promise<FeeStructureDetail | null> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const structure = await deps.structures.findById(tx, id);
    if (!structure) return null;
    const instalments = await deps.structures.listInstalments(tx, id);
    const withLines = await Promise.all(instalments.map(async (i) => ({
      ...i, lines: await deps.structures.listLines(tx, i.id),
    })));
    const totalPaise = withLines.reduce(
      (sum, i) => sum + i.lines.reduce((s, l) => s + l.amountPaise, 0), 0,
    );
    return { ...structure, instalments: withLines, totalPaise };
  });
}

export async function listStructures(deps: FeesDeps, actor: FeesActor, programId: string | null) {
  return deps.uow.run(actor.tenantId, (tx) => deps.structures.list(tx, programId));
}

/**
 * Publication is the point of no return: FEE-2 generates invoices from a
 * published structure, so it must be complete first.
 */
export async function publishStructure(
  deps: FeesDeps, actor: FeesActor, input: { id: string },
): Promise<Result<{ published: true }>> {
  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const structure = await deps.structures.findById(tx, input.id);
    if (!structure) return Err(fail('NOT_FOUND', 'That fee structure was not found.'));
    if (structure.status !== 'draft') {
      return Err(fail('CONFLICT', `This fee structure is already ${structure.status}.`));
    }

    const instalments = await deps.structures.listInstalments(tx, input.id);
    if (instalments.length === 0) {
      return Err(fail('VALIDATION_FAILED',
        'Add at least one instalment before publishing. A fee structure with nothing due asks nothing of anyone.'));
    }
    for (const instalment of instalments) {
      const lines = await deps.structures.listLines(tx, instalment.id);
      if (lines.length === 0) {
        return Err(fail('VALIDATION_FAILED',
          `Instalment ${instalment.seq} has no fee heads. Publication cannot be undone, so every instalment must carry an amount.`));
      }
    }

    const published = await deps.structures.publish(tx, input.id, actor.personId, at);
    if (!published) return Err(fail('CONFLICT', 'That fee structure was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.structure_published', subjectType: 'fee_structure', subjectId: input.id,
      before: { status: 'draft' },
      after: { status: 'published', instalments: instalments.length },
    }, tx);

    return Ok({ published: true as const });
  });
}

/* --------------------------------------------------------------- invoices */

/**
 * FEE-2: an invoice per enrolled student per instalment of a published
 * structure. Idempotent — a student already invoiced for an instalment is
 * skipped, so running this again after a new admission only invoices who is
 * new, and never duplicates or edits an existing invoice.
 */
export async function generateInvoices(
  deps: FeesDeps, actor: FeesActor, input: { structureId: string },
): Promise<Result<{ generated: number; skipped: number }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const structure = await deps.structures.findById(tx, input.structureId);
    if (!structure) return Err(fail('NOT_FOUND', 'That fee structure was not found.'));
    if (structure.status !== 'published') {
      return Err(fail('VALIDATION_FAILED', 'Only a published fee structure can be invoiced.'));
    }

    const instalments = await deps.structures.listInstalments(tx, structure.id);
    const studentIds = await deps.invoices.enrolledStudentIds(tx, structure.programId);

    let generated = 0;
    let skipped = 0;
    for (const studentId of studentIds) {
      for (const instalment of instalments) {
        if (await deps.invoices.existsFor(tx, studentId, instalment.id)) {
          skipped += 1;
          continue;
        }
        const lines = await deps.structures.listLines(tx, instalment.id);
        const amountPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0);
        await deps.invoices.create(tx, {
          id: deps.ids.next(), tenantId: actor.tenantId, studentId,
          feeStructureId: structure.id, instalmentId: instalment.id,
          amountPaise, dueDate: instalment.dueDate,
        });
        generated += 1;
      }
    }

    if (generated > 0) {
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'fee.invoices_generated', subjectType: 'fee_structure', subjectId: structure.id,
        after: { generated, skipped, students: studentIds.length },
      }, tx);
    }

    return Ok({ generated, skipped });
  }), 'Invoices could not be generated.');
}

export async function listStudentInvoices(
  deps: FeesDeps, actor: FeesActor, studentId: string,
): Promise<InvoiceRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.invoices.listByStudent(tx, studentId));
}

export async function listStructureInvoices(
  deps: FeesDeps, actor: FeesActor, structureId: string,
): Promise<InvoiceRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.invoices.listByStructure(tx, structureId));
}

/* --------------------------------------------------------- fines & late fees */

/** FEE-5: a fine, charged directly — no approval needed to raise one (module doc §5). */
export async function raiseFine(
  deps: FeesDeps, actor: FeesActor, input: { studentId: string; amountPaise: number; reason: string },
): Promise<Result<{ id: string }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const id = deps.ids.next();
    await deps.invoices.createFine(tx, {
      id, tenantId: actor.tenantId, studentId: input.studentId,
      amountPaise: input.amountPaise, reason: input.reason.trim(), dueDate: todayIso(deps.clock),
    });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.fine_raised', subjectType: 'invoice', subjectId: id,
      after: { studentId: input.studentId, amountPaise: input.amountPaise, reason: input.reason.trim() },
    }, tx);
    return Ok({ id });
  }), 'That fine could not be raised.');
}

/**
 * FEE-5: charges the flat late fee on every student still owing on this
 * instalment past its due date. Idempotent, like generateInvoices — a
 * student already charged is skipped, never charged twice. v1 boundary: no
 * scheduler exists in this codebase, so this is triggered by the
 * Accountant (or, later, a real scheduler calling the same endpoint), not
 * applied automatically at midnight.
 */
export async function applyLateFees(
  deps: FeesDeps, actor: FeesActor, input: { instalmentId: string },
): Promise<Result<{ applied: number; skipped: number }>> {
  const today = todayIso(deps.clock);
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const instalment = await deps.structures.findInstalment(tx, input.instalmentId);
    if (!instalment) return Err(fail('NOT_FOUND', 'That instalment was not found.'));
    if (!instalment.lateFeePaise) {
      return Err(fail('VALIDATION_FAILED', 'This instalment carries no late fee to apply.'));
    }
    if (instalment.dueDate >= today) {
      return Err(fail('VALIDATION_FAILED', 'This instalment is not overdue yet.'));
    }

    const structure = await deps.structures.findById(tx, instalment.structureId);
    if (!structure) return Err(fail('NOT_FOUND', 'That fee structure was not found.'));

    const studentIds = await deps.invoices.studentsStillDue(tx, input.instalmentId);
    let applied = 0;
    let skipped = 0;
    for (const studentId of studentIds) {
      if (await deps.invoices.hasLateFee(tx, studentId, input.instalmentId)) {
        skipped += 1;
        continue;
      }
      await deps.invoices.createLateFee(tx, {
        id: deps.ids.next(), tenantId: actor.tenantId, studentId, feeStructureId: structure.id,
        instalmentId: input.instalmentId, amountPaise: instalment.lateFeePaise, dueDate: today,
        reason: `Late fee: instalment ${instalment.seq} overdue since ${instalment.dueDate}`,
      });
      applied += 1;
    }

    if (applied > 0) {
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'fee.late_fees_applied', subjectType: 'fee_structure_instalment', subjectId: input.instalmentId,
        after: { applied, skipped },
      }, tx);
    }

    return Ok({ applied, skipped });
  }), 'Late fees could not be applied.');
}

/* --------------------------------------------------------- concessions */

/**
 * FEE-3: the Accountant asks for a reduction on one invoice; only the
 * College Admin's approval (fee.approve) makes it real (module doc §5).
 */
export async function requestConcession(
  deps: FeesDeps, actor: FeesActor,
  input: { invoiceId: string; amountPaise: number; reason: string },
): Promise<Result<{ id: string }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const invoice = await deps.invoices.findById(tx, input.invoiceId);
    if (!invoice) return Err(fail('NOT_FOUND', 'That invoice was not found.'));
    if (invoice.status !== 'due') {
      return Err(fail('CONFLICT', `This invoice is already ${invoice.status}; there is nothing left to reduce.`));
    }
    if (input.amountPaise > invoice.amountPaise) {
      return Err(fail('VALIDATION_FAILED', 'The concession cannot be more than the invoice still asks for.'));
    }
    if (await deps.requests.hasOpenRequest(tx, input.invoiceId)) {
      return Err(fail('CONFLICT', 'A request is already pending for this invoice.'));
    }

    const id = deps.ids.next();
    await deps.requests.create(tx, {
      id, tenantId: actor.tenantId, kind: 'concession', studentId: invoice.studentId,
      invoiceId: input.invoiceId, amountPaise: input.amountPaise, reason: input.reason.trim(),
      requestedBy: actor.personId,
    });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.concession_requested', subjectType: 'fee_request', subjectId: id,
      after: { invoiceId: input.invoiceId, amountPaise: input.amountPaise, reason: input.reason.trim() },
    }, tx);
    return Ok({ id });
  }), 'That concession could not be requested.');
}

/**
 * FEE-5: waiving a fine or a late fee already charged, through the same
 * approval shape as a concession. A waiver is always for the whole charge —
 * there is no partial waiver in v1, matching how a fine or late fee is a
 * single freeform amount rather than a bill with its own line items.
 */
export async function requestWaiver(
  deps: FeesDeps, actor: FeesActor, input: { invoiceId: string; reason: string },
): Promise<Result<{ id: string }>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const invoice = await deps.invoices.findById(tx, input.invoiceId);
    if (!invoice) return Err(fail('NOT_FOUND', 'That invoice was not found.'));
    if (invoice.kind !== 'fine' && invoice.kind !== 'late_fee') {
      return Err(fail('VALIDATION_FAILED', 'Only a fine or a late fee can be waived; an instalment takes a concession instead.'));
    }
    if (invoice.status !== 'due') {
      return Err(fail('CONFLICT', `This is already ${invoice.status}; there is nothing left to waive.`));
    }
    if (await deps.requests.hasOpenRequest(tx, input.invoiceId)) {
      return Err(fail('CONFLICT', 'A request is already pending for this invoice.'));
    }

    const id = deps.ids.next();
    await deps.requests.create(tx, {
      id, tenantId: actor.tenantId, kind: 'waiver', studentId: invoice.studentId,
      invoiceId: input.invoiceId, amountPaise: invoice.amountPaise, reason: input.reason.trim(),
      requestedBy: actor.personId,
    });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.waiver_requested', subjectType: 'fee_request', subjectId: id,
      after: { invoiceId: input.invoiceId, amountPaise: invoice.amountPaise, reason: input.reason.trim() },
    }, tx);
    return Ok({ id });
  }), 'That waiver could not be requested.');
}

export async function withdrawRequest(
  deps: FeesDeps, actor: FeesActor, id: string,
): Promise<Result<{ withdrawn: true }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const withdrawn = await deps.requests.withdraw(tx, id, actor.personId);
    if (!withdrawn) {
      return Err(fail('CONFLICT', 'That request cannot be withdrawn: it is already decided, or is not yours.'));
    }
    return Ok({ withdrawn: true as const });
  });
}

async function decideRequest(
  deps: FeesDeps, actor: FeesActor,
  input: { id: string; status: 'approved' | 'rejected'; reason: string | null },
): Promise<Result<{ id: string; status: 'approved' | 'rejected' }>> {
  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const request = await deps.requests.findById(tx, input.id);
    if (!request) return Err(fail('NOT_FOUND', 'That request was not found.'));
    if (request.status !== 'requested') return Err(fail('CONFLICT', `This request is already ${request.status}.`));

    if (input.status === 'approved') {
      const applied = await deps.invoices.reduceAmount(tx, request.invoiceId, request.amountPaise);
      if (!applied) {
        return Err(fail('CONFLICT',
          'The invoice changed since this was requested and can no longer take this reduction.'));
      }
      // A full reduction (usually a waiver, but a 100% concession too) leaves
      // nothing owed, which is what "paid" already means for an invoice.
      const invoice = await deps.invoices.findById(tx, request.invoiceId);
      if (invoice && invoice.amountPaise === 0) await deps.invoices.markPaid(tx, request.invoiceId);
    }

    const decided = await deps.requests.decide(tx, {
      id: input.id, status: input.status, decidedBy: actor.personId, decidedAt: at, reason: input.reason,
    });
    if (!decided) return Err(fail('CONFLICT', 'That request was changed by someone else just now.'));

    const verb = request.kind === 'waiver' ? 'waiver' : 'concession';
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: input.status === 'approved' ? `fee.${verb}_approved` : `fee.${verb}_rejected`,
      subjectType: 'fee_request', subjectId: input.id,
      before: { status: 'requested' },
      after: { status: input.status, reason: input.reason },
    }, tx);

    return Ok({ id: input.id, status: input.status });
  });
}

export const approveRequest = (deps: FeesDeps, actor: FeesActor, input: { id: string; reason?: string | null }) =>
  decideRequest(deps, actor, { id: input.id, status: 'approved', reason: input.reason ?? null });

export const rejectRequest = (deps: FeesDeps, actor: FeesActor, input: { id: string; reason: string }) =>
  decideRequest(deps, actor, { id: input.id, status: 'rejected', reason: input.reason });

export async function listFeeRequests(
  deps: FeesDeps, actor: FeesActor, filter: { studentId?: string | null; status?: FeeRequestRecord['status'] | null },
): Promise<FeeRequestRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.requests.list(tx, filter));
}

/* ----------------------------------------------------------------- payments */

export interface RecordedPayment {
  payment: PaymentRecord;
  receipt: ReceiptRecord;
  allocations: { invoiceId: string; amountPaise: number }[];
}

/**
 * FEE-4: a counter payment, allocated to the student's oldest due invoices
 * first, with a receipt issued at the moment of recording (module doc §6).
 * v1 boundary: a payment may not exceed the student's total current dues —
 * there is no advance/credit balance yet.
 */
export async function recordPayment(
  deps: FeesDeps, actor: FeesActor,
  input: { studentId: string; method: PaymentMethod; amountPaise: number; reference: string | null },
): Promise<Result<RecordedPayment>> {
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const due = await deps.invoices.listDueByStudent(tx, input.studentId);
    const totalDue = due.reduce((sum, i) => sum + i.amountPaise, 0);
    if (totalDue === 0) return Err(fail('VALIDATION_FAILED', 'This student has nothing due.'));
    if (input.amountPaise > totalDue) {
      return Err(fail('VALIDATION_FAILED',
        `That is more than the ${totalDue} paise this student currently owes. Partial and exact payments are accepted; an advance balance is not, yet.`));
    }

    const paymentId = deps.ids.next();
    await deps.payments.createPayment(tx, {
      id: paymentId, tenantId: actor.tenantId, studentId: input.studentId, kind: 'payment',
      method: input.method, amountPaise: input.amountPaise, reference: input.reference,
      reversesPaymentId: null, reason: null, receivedBy: actor.personId,
    });

    const allocations = await allocate(deps, tx, actor.tenantId, paymentId, due, input.amountPaise);

    const receiptNumber = await deps.payments.nextReceiptNumber(tx, actor.tenantId);
    const receiptId = deps.ids.next();
    await deps.payments.createReceipt(tx, {
      id: receiptId, tenantId: actor.tenantId, paymentId, receiptNumber,
    });

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.payment_recorded', subjectType: 'payment', subjectId: paymentId,
      after: {
        studentId: input.studentId, method: input.method, amountPaise: input.amountPaise,
        receiptNumber, invoices: allocations.map((a) => a.invoiceId),
      },
    }, tx);

    const payment = await deps.payments.findPayment(tx, paymentId);
    const receipt = await deps.payments.findReceiptByPayment(tx, paymentId);
    return Ok({ payment: payment!, receipt: receipt!, allocations });
  }), 'That payment could not be recorded.');
}

/** Splits amountPaise across due invoices, oldest first, marking each paid as it fills. */
async function allocate(
  deps: FeesDeps, tx: Tx, tenantId: string, paymentId: string,
  due: InvoiceRecord[], amountPaise: number,
): Promise<{ invoiceId: string; amountPaise: number }[]> {
  const allocations: { invoiceId: string; amountPaise: number }[] = [];
  let remaining = amountPaise;
  for (const invoice of due) {
    if (remaining <= 0) break;
    const alreadyPaid = await deps.payments.netPaidOnInvoice(tx, invoice.id);
    const stillOwed = invoice.amountPaise - alreadyPaid;
    if (stillOwed <= 0) continue;
    const take = Math.min(stillOwed, remaining);
    await deps.payments.addAllocation(tx, {
      id: deps.ids.next(), tenantId, paymentId, invoiceId: invoice.id, amountPaise: take,
    });
    allocations.push({ invoiceId: invoice.id, amountPaise: take });
    remaining -= take;
    if (take === stillOwed) await deps.invoices.markPaid(tx, invoice.id);
  }
  return allocations;
}

/**
 * Cancels a payment by inserting a reversal that mirrors its allocations in
 * reverse (module doc §3: never edit, never delete). Any invoice the
 * original payment had fully paid moves back to due.
 */
export async function cancelPayment(
  deps: FeesDeps, actor: FeesActor, input: { paymentId: string; reason: string },
): Promise<Result<{ reversalId: string }>> {
  const at = deps.clock.now();
  return attempt(() => deps.uow.run(actor.tenantId, async (tx) => {
    const payment = await deps.payments.findPayment(tx, input.paymentId);
    if (!payment) return Err(fail('NOT_FOUND', 'That payment was not found.'));
    if (payment.kind === 'reversal') return Err(fail('VALIDATION_FAILED', 'A reversal cannot itself be reversed.'));
    if (await deps.payments.reversalOf(tx, input.paymentId)) {
      return Err(fail('CONFLICT', 'That payment was already cancelled.'));
    }

    const receipt = await deps.payments.findReceiptByPayment(tx, input.paymentId);
    if (!receipt || receipt.status !== 'issued') {
      return Err(fail('CONFLICT', 'That payment has no active receipt to cancel.'));
    }

    const reversalId = deps.ids.next();
    await deps.payments.createPayment(tx, {
      id: reversalId, tenantId: actor.tenantId, studentId: payment.studentId, kind: 'reversal',
      method: payment.method, amountPaise: payment.amountPaise, reference: payment.reference,
      reversesPaymentId: payment.id, reason: input.reason.trim(), receivedBy: actor.personId,
    });

    const original = await deps.payments.allocationsFor(tx, payment.id);
    for (const a of original) {
      await deps.payments.addAllocation(tx, {
        id: deps.ids.next(), tenantId: actor.tenantId, paymentId: reversalId,
        invoiceId: a.invoiceId, amountPaise: a.amountPaise,
      });
      const net = await deps.payments.netPaidOnInvoice(tx, a.invoiceId);
      const invoice = await deps.invoices.findById(tx, a.invoiceId);
      if (invoice && invoice.status === 'paid' && net < invoice.amountPaise) {
        await deps.invoices.markDue(tx, a.invoiceId);
      }
    }

    await deps.payments.cancelReceipt(tx, {
      paymentId: payment.id, cancelledBy: actor.personId, cancelledAt: at, reason: input.reason.trim(),
    });

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'fee.payment_cancelled', subjectType: 'payment', subjectId: payment.id,
      after: { reversalId, reason: input.reason.trim() },
    }, tx);

    return Ok({ reversalId });
  }), 'That payment could not be cancelled.');
}

export async function listStudentPayments(deps: FeesDeps, actor: FeesActor, studentId: string) {
  return deps.uow.run(actor.tenantId, (tx) => deps.payments.listByStudent(tx, studentId));
}

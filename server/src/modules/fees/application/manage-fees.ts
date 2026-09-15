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
  FeeHeadRepository, FeeInstalmentRecord, FeeLineRecord, FeeStructureRepository,
  InvoiceRecord, InvoiceRepository,
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
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

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

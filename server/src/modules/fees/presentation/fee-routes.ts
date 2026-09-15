import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  addInstalment, addLine, approveRequest, archiveFeeHead, createDraftStructure, createFeeHead,
  generateInvoices, listFeeHeads, listFeeRequests, listStructureInvoices, listStructures,
  listStudentInvoices, publishStructure, readStructure, rejectRequest, requestConcession,
  withdrawRequest, type FeesActor,
} from '../application/manage-fees.ts';
import type { FeeHeadRecord, FeeRequestRecord, FeeStructureRecord, InvoiceRecord } from '../application/ports.ts';

const headBody = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(20),
});
const structureBody = z.object({
  program_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const instalmentBody = z.object({
  seq: z.number().int().positive(),
  due_date: isoDate,
  late_fee_paise: z.number().int().positive().nullable().optional(),
});
const lineBody = z.object({
  fee_head_id: z.string().uuid(),
  amount_paise: z.number().int().positive(),
});

const serialiseHead = (h: FeeHeadRecord) => ({ id: h.id, name: h.name, code: h.code, status: h.status });
const serialiseStructure = (s: FeeStructureRecord) => ({
  id: s.id, program_id: s.programId, program_name: s.programName,
  academic_year_id: s.academicYearId, academic_year_name: s.academicYearName,
  status: s.status, published_at: s.publishedAt?.toISOString() ?? null,
});
const serialiseInvoice = (i: InvoiceRecord) => ({
  id: i.id, student_id: i.studentId, student_name: i.studentName, enrolment_number: i.enrolmentNumber,
  fee_structure_id: i.feeStructureId, instalment_id: i.instalmentId, instalment_seq: i.instalmentSeq,
  amount_paise: i.amountPaise, due_date: i.dueDate, status: i.status,
});
const serialiseRequest = (r: FeeRequestRecord) => ({
  id: r.id, kind: r.kind, student_id: r.studentId, student_name: r.studentName, invoice_id: r.invoiceId,
  amount_paise: r.amountPaise, reason: r.reason, status: r.status,
  requested_by: r.requestedBy, requested_at: r.requestedAt.toISOString(),
  decided_by: r.decidedBy, decided_at: r.decidedAt?.toISOString() ?? null, decision_reason: r.decisionReason,
});

const concessionBody = z.object({
  invoice_id: z.string().uuid(),
  amount_paise: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});
const decisionBody = z.object({ reason: z.string().max(500).optional() });
const rejectBody = z.object({ reason: z.string().min(1).max(500) });

export async function registerFeeRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): FeesActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  const canRead = (req: never, reply: never) => requirePermission(c, req, reply, 'fee.read', institutionScope());
  const canManage = (req: never, reply: never) => requirePermission(c, req, reply, 'fee.manage', institutionScope());
  const canApprove = (req: never, reply: never) => requirePermission(c, req, reply, 'fee.approve', institutionScope());

  /* ------------------------------------------------------------------ heads */

  app.get('/fees/heads', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const archived = (req.query as { archived?: string }).archived === 'true';
    const rows = await listFeeHeads(c.fees, actorOf(req), archived);
    return sendOk(reply, rows.map(serialiseHead));
  });

  app.post('/fees/heads', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = headBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createFeeHead(c.fees, actorOf(req), parsed.data), 201);
  });

  app.delete('/fees/heads/:id', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    return sendResult(reply, await archiveFeeHead(c.fees, actorOf(req), (req.params as { id: string }).id));
  });

  /* ------------------------------------------------------------ structures */

  app.get('/fees/structures', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const programId = (req.query as { program_id?: string }).program_id ?? null;
    const rows = await listStructures(c.fees, actorOf(req), programId);
    return sendOk(reply, rows.map(serialiseStructure));
  });

  app.get('/fees/structures/:id', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const structure = await readStructure(c.fees, actorOf(req), (req.params as { id: string }).id);
    if (!structure) return sendFailure(reply, fail('NOT_FOUND', 'That fee structure was not found.'));
    return sendOk(reply, {
      id: structure.id, program_id: structure.programId, program_name: structure.programName,
      academic_year_id: structure.academicYearId, academic_year_name: structure.academicYearName,
      status: structure.status, published_at: structure.publishedAt?.toISOString() ?? null,
      total_paise: structure.totalPaise,
      instalments: structure.instalments.map((i) => ({
        id: i.id, seq: i.seq, due_date: i.dueDate, late_fee_paise: i.lateFeePaise,
        lines: i.lines.map((l) => ({
          id: l.id, fee_head_id: l.feeHeadId, fee_head_name: l.feeHeadName, amount_paise: l.amountPaise,
        })),
      })),
    });
  });

  app.post('/fees/structures', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = structureBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createDraftStructure(c.fees, actorOf(req), {
      programId: parsed.data.program_id, academicYearId: parsed.data.academic_year_id,
    }), 201);
  });

  app.post('/fees/structures/:id/instalments', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = instalmentBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await addInstalment(c.fees, actorOf(req), {
      structureId: (req.params as { id: string }).id,
      seq: parsed.data.seq, dueDate: parsed.data.due_date, lateFeePaise: parsed.data.late_fee_paise ?? null,
    }), 201);
  });

  app.post('/fees/instalments/:id/lines', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = lineBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await addLine(c.fees, actorOf(req), {
      instalmentId: (req.params as { id: string }).id,
      feeHeadId: parsed.data.fee_head_id, amountPaise: parsed.data.amount_paise,
    }), 201);
  });

  app.post('/fees/structures/:id/publish', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    return sendResult(reply, await publishStructure(c.fees, actorOf(req), { id: (req.params as { id: string }).id }));
  });

  /* --------------------------------------------------------------- invoices */

  app.post('/fees/structures/:id/invoices', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    return sendResult(reply, await generateInvoices(c.fees, actorOf(req), {
      structureId: (req.params as { id: string }).id,
    }));
  });

  app.get('/fees/structures/:id/invoices', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const rows = await listStructureInvoices(c.fees, actorOf(req), (req.params as { id: string }).id);
    return sendOk(reply, rows.map(serialiseInvoice));
  });

  app.get('/fees/students/:id/invoices', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const rows = await listStudentInvoices(c.fees, actorOf(req), (req.params as { id: string }).id);
    return sendOk(reply, rows.map(serialiseInvoice));
  });

  /* -------------------------------------------------------------- requests */

  app.get('/fees/requests', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = req.query as { student_id?: string; status?: string };
    const rows = await listFeeRequests(c.fees, actorOf(req), {
      studentId: q.student_id ?? null,
      status: (q.status as FeeRequestRecord['status'] | undefined) ?? null,
    });
    return sendOk(reply, rows.map(serialiseRequest));
  });

  app.post('/fees/concessions', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    const parsed = concessionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await requestConcession(c.fees, actorOf(req), {
      invoiceId: parsed.data.invoice_id, amountPaise: parsed.data.amount_paise, reason: parsed.data.reason,
    }), 201);
  });

  app.post('/fees/requests/:id/withdraw', async (req, reply) => {
    if (!(await canManage(req as never, reply as never))) return reply;
    return sendResult(reply, await withdrawRequest(c.fees, actorOf(req), (req.params as { id: string }).id));
  });

  app.post('/fees/requests/:id/approve', async (req, reply) => {
    if (!(await canApprove(req as never, reply as never))) return reply;
    const parsed = decisionBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await approveRequest(c.fees, actorOf(req), {
      id: (req.params as { id: string }).id, reason: parsed.data.reason ?? null,
    }));
  });

  app.post('/fees/requests/:id/reject', async (req, reply) => {
    if (!(await canApprove(req as never, reply as never))) return reply;
    const parsed = rejectBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await rejectRequest(c.fees, actorOf(req), {
      id: (req.params as { id: string }).id, reason: parsed.data.reason,
    }));
  });
}

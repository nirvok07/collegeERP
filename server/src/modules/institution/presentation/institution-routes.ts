import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission, requirePlatformActor } from '../../../infrastructure/http/guards.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  archiveCampus, archiveDepartment, createCampus, createDepartment,
  listCampuses, listDepartments, renameDepartment, type OrgActor,
} from '../application/manage-org-units.ts';
import { fail } from '../../../core/errors.ts';
import { provisionInstitution } from '../application/provision-institution.ts';
import {
  changeLifecycle, getInstitutionDetail, reissueInvitation, type InstitutionDetail,
} from '../application/manage-lifecycle.ts';
import type { LifecycleAction } from '../domain/lifecycle.ts';
import { listPlatformAudit, MAX_PAGE } from '../application/platform-audit.ts';

const provision = z.object({
  code: z.string().min(3).max(32),
  name: z.string().min(2).max(200),
  plan: z.string().optional(),
  seat_limit: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  admin: z.object({
    full_name: z.string().min(2).max(200),
    email: z.string().email(),
    phone: z.string().max(20).optional(),
  }),
});

const unitBody = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(32),
});
const departmentBody = unitBody.extend({ campus_id: z.string().uuid() });
const renameBody = z.object({ name: z.string().min(2).max(120) });
const archiveBody = z.object({ reason: z.string().min(1).max(500) });
const auditQuery = z.object({
  college: z.string().uuid().optional(),
  action: z.string().regex(/^[a-z_]+(\.[a-z_]+)*$/).max(80).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
});

const lifecycleBody = z.object({
  version: z.number().int().positive(),
  reason: z.string().max(500),
  confirm_code: z.string().max(64).optional(),
});

/** The platform's view of a college: its record and its first administrator, nothing operational. */
function detailJson(d: InstitutionDetail) {
  const i = d.institution;
  return {
    id: i.id, code: i.code, name: i.name, status: i.status, suspended_from: i.suspendedFrom ?? null,
    plan: i.plan, seat_limit: i.seatLimit, timezone: i.timezone, version: i.version,
    created_at: i.createdAt ?? null, status_changed_at: i.statusChangedAt ?? null,
    actions: d.actions,
    administrator: d.administrator && {
      full_name: d.administrator.fullName,
      email: d.administrator.email,
      account_status: d.administrator.accountStatus,
      invitation: {
        state: d.administrator.invitation.state,
        expires_at: d.administrator.invitation.expiresAt?.toISOString() ?? null,
      },
      can_reissue: d.administrator.canReissue,
    },
  };
}

export async function registerInstitutionRoutes(app: FastifyInstance, c: Container) {
  const orgActor = (req: { actor?: { sub: string; tenantId: string | null } }): OrgActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const validationFailure = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  /*
   * The organisational tree. Read by anyone who can see people, because scope
   * names appear wherever authority is shown; written only by campus and
   * department managers.
   */
  app.get('/campuses', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'person.read', institutionScope()))) return reply;
    const includeArchived = (req.query as { archived?: string }).archived === 'true';
    const rows = await listCampuses(c.manageOrg, orgActor(req), includeArchived);
    return sendOk(reply, rows.map((campus) => ({
      id: campus.id, name: campus.name, code: campus.code,
      is_default: campus.isDefault, status: campus.status,
      department_count: campus.departmentCount,
    })));
  });

  app.post('/campuses', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'campus.manage', institutionScope()))) return reply;
    const parsed = unitBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
    const result = await createCampus(c.manageOrg, orgActor(req), parsed.data);
    return sendResult(reply, result, 201);
  });

  app.post('/campuses/:id/archive', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'campus.manage', institutionScope()))) return reply;
    const parsed = archiveBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
    const result = await archiveCampus(c.manageOrg, orgActor(req), {
      id: (req.params as { id: string }).id, reason: parsed.data.reason,
    });
    return sendResult(reply, result);
  });

  app.get('/departments', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'person.read', institutionScope()))) return reply;
    const includeArchived = (req.query as { archived?: string }).archived === 'true';
    const rows = await listDepartments(c.manageOrg, orgActor(req), includeArchived);
    return sendOk(reply, rows.map((d) => ({
      id: d.id, name: d.name, code: d.code, status: d.status,
      campus_id: d.campusId, campus_name: d.campusName,
    })));
  });

  app.post('/departments', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'department.manage', institutionScope()))) return reply;
    const parsed = departmentBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
    const result = await createDepartment(c.manageOrg, orgActor(req), {
      campusId: parsed.data.campus_id, name: parsed.data.name, code: parsed.data.code,
    });
    return sendResult(reply, result, 201);
  });

  app.patch('/departments/:id', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'department.manage', institutionScope()))) return reply;
    const parsed = renameBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
    const result = await renameDepartment(c.manageOrg, orgActor(req), {
      id: (req.params as { id: string }).id, name: parsed.data.name,
    });
    return sendResult(reply, result);
  });

  app.post('/departments/:id/archive', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'department.manage', institutionScope()))) return reply;
    const parsed = archiveBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
    const result = await archiveDepartment(c.manageOrg, orgActor(req), {
      id: (req.params as { id: string }).id, reason: parsed.data.reason,
    });
    return sendResult(reply, result);
  });

  /**
   * W0. One request creates the institution and its first administrator, per
   * AD-20. The response carries the invitation token once; it is never stored
   * in plaintext and never retrievable again.
   */
  app.post('/institutions', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;

    const parsed = provision.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      return sendFailure(
        reply,
        fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors }),
      );
    }

    const result = await provisionInstitution(c.provisionInstitution, {
      code: parsed.data.code,
      name: parsed.data.name,
      plan: parsed.data.plan,
      seatLimit: parsed.data.seat_limit,
      timezone: parsed.data.timezone,
      admin: {
        fullName: parsed.data.admin.full_name,
        email: parsed.data.admin.email,
        phone: parsed.data.admin.phone ?? null,
      },
      actingPlatformAccountId: req.actor!.sub,
    });

    if (!result.ok) return sendFailure(reply, result.error);

    return sendOk(
      reply,
      {
        institution: {
          id: result.value.institution.id,
          code: result.value.institution.code,
          name: result.value.institution.name,
          status: result.value.institution.status,
          seat_limit: result.value.institution.seatLimit,
        },
        administrator: {
          person_id: result.value.adminPersonId,
          account_id: result.value.adminAccountId,
        },
        invitation: {
          token: result.value.invitationToken,
          expires_at: result.value.invitationExpiresAt.toISOString(),
          // Delivery is outside the provisioning transaction, so status is
          // reported rather than assumed.
          delivery: 'pending',
        },
      },
      201,
    );
  });

  app.get('/institutions', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;
    const rows = await c.uow.run(null, (tx) => c.institutions.list(tx, 50));
    return sendOk(
      reply,
      rows.map((r) => ({
        id: r.id, code: r.code, name: r.name, status: r.status, seat_limit: r.seatLimit,
      })),
    );
  });

  /* SA-1: one college, its lifecycle, and its administrator's invitation. */
  app.get('/institutions/:id', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return sendFailure(reply, fail('NOT_FOUND', 'That college was not found.'));
    const result = await getInstitutionDetail(c.lifecycle, id);
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, detailJson(result.value));
  });

  for (const action of ['suspend', 'reactivate', 'close'] as const satisfies readonly LifecycleAction[]) {
    app.post(`/institutions/:id/${action}`, async (req, reply) => {
      if (!requirePlatformActor(req, reply)) return reply;
      const id = (req.params as { id: string }).id;
      if (!z.string().uuid().safeParse(id).success) return sendFailure(reply, fail('NOT_FOUND', 'That college was not found.'));
      const parsed = lifecycleBody.safeParse(req.body);
      if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
      const result = await changeLifecycle(c.lifecycle, {
        id, action, version: parsed.data.version, reason: parsed.data.reason,
        confirmCode: parsed.data.confirm_code, platformAccountId: req.actor!.sub,
      });
      if (!result.ok) return sendFailure(reply, result.error);
      return sendOk(reply, detailJson(result.value));
    });
  }

  app.post('/institutions/:id/administrator-invitation', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return sendFailure(reply, fail('NOT_FOUND', 'That college was not found.'));
    const result = await reissueInvitation(c.lifecycle, { id, platformAccountId: req.actor!.sub });
    if (!result.ok) return sendFailure(reply, result.error);
    // The token is in this response only, as at provisioning.
    return sendOk(reply, {
      institution: detailJson(result.value.detail),
      invitation: { token: result.value.token, expires_at: result.value.expiresAt.toISOString(), delivery: 'pending' },
    }, 201);
  });


  /*
   * SA-2: platform events, newest first, keyset-paginated (AD-61). Only events
   * a platform account caused; a college's own activity is not visible here.
   */
  app.get('/platform/audit', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;
    const parsed = auditQuery.safeParse(req.query);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));
    const q = parsed.data;
    const result = await listPlatformAudit(c.platformAudit, {
      tenantId: q.college ?? null, action: q.action ?? null,
      from: q.from ?? null, to: q.to ?? null, cursor: q.cursor ?? null, limit: q.limit ?? null,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, {
      events: result.value.rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        correlation_id: r.correlationId,
        college: r.college,
        actor: r.actor,
        action: r.action,
        subject: r.subject,
        before: r.before ?? null,
        after: r.after ?? null,
        reason: r.reason,
      })),
      next_cursor: result.value.nextCursor,
    });
  });

}

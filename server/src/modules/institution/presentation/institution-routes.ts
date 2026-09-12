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
}

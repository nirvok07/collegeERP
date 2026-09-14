import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope, type ScopeType } from '../domain/scope.ts';
import {
  assignRole, invitePerson, listAssignments, listPeople, revokeAssignment, type Actor,
} from '../application/manage-people.ts';
import { issuePasswordReset } from '../application/password-reset.ts';
import { issueStudentAccess } from '../application/student-access.ts';

const SCOPE_TYPES = ['institution', 'campus', 'department', 'program', 'section', 'committee', 'self'] as const;

const inviteBody = z.object({
  full_name: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  person_type: z.enum(['staff', 'student']),
  role: z.object({
    role_key: z.string().min(1),
    scope_type: z.enum(SCOPE_TYPES),
    scope_ref_id: z.string().uuid().nullable().optional(),
    valid_to: z.string().datetime().nullable().optional(),
  }).optional(),
});

const assignBody = z.object({
  person_id: z.string().uuid(),
  role_key: z.string().min(1),
  scope_type: z.enum(SCOPE_TYPES),
  scope_ref_id: z.string().uuid().nullable().optional(),
  valid_to: z.string().datetime().nullable().optional(),
  reason: z.string().max(500).optional(),
});

const revokeBody = z.object({ reason: z.string().min(1).max(500) });

export async function registerPeopleRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): Actor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const validationFailure = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  app.get('/people', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'person.read', institutionScope()))) return reply;
    const query = req.query as Record<string, string | undefined>;
    const rows = await listPeople(c.managePeople, actorOf(req), {
      search: query.q?.trim() || undefined,
      personType: query.type || undefined,
      accountStatus: query.status || undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return sendOk(reply, rows.map((p) => ({
      person_id: p.personId,
      full_name: p.fullName,
      email: p.primaryEmail,
      person_type: p.personType,
      account_status: p.accountStatus,
      last_login_at: p.lastLoginAt,
      role_keys: p.roleKeys,
    })));
  });

  app.get('/roles', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'person.read', institutionScope()))) return reply;
    const roles = await c.uow.run(req.actor!.tenantId, (tx) => c.roleDefinitions.listAvailable(tx));
    return sendOk(reply, roles.map((r) => ({
      key: r.key,
      name: r.name,
      allowed_scope_types: r.allowedScopeTypes,
      permission_count: r.permissionKeys.length,
      // The drawer shows a sentence, not a checkbox list: nobody can read a
      // permission list and predict its effect.
      summary: summarise(r.permissionKeys),
    })));
  });

  app.post('/people', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'account.manage', institutionScope()))) return reply;
    const parsed = inviteBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));

    // Granting authority is a distinct permission from inviting someone.
    if (parsed.data.role &&
        !(await requirePermission(c, req, reply, 'role.assign', institutionScope()))) return reply;

    const result = await invitePerson(c.managePeople, actorOf(req), {
      fullName: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      personType: parsed.data.person_type,
      role: parsed.data.role
        ? {
            roleKey: parsed.data.role.role_key,
            scopeType: parsed.data.role.scope_type as ScopeType,
            scopeRefId: parsed.data.role.scope_ref_id ?? null,
            validTo: parsed.data.role.valid_to ? new Date(parsed.data.role.valid_to) : null,
          }
        : undefined,
    });

    if (!result.ok) return sendFailure(reply, result.error);
    c.authority.invalidate(result.value.personId);
    return sendOk(reply, {
      person_id: result.value.personId,
      account_id: result.value.accountId,
      invitation: {
        token: result.value.invitationToken,
        expires_at: result.value.expiresAt.toISOString(),
        delivery: 'pending',
      },
    }, 201);
  });

  /*
   * AD-80: a one-time code for someone who forgot their password (or a fresh
   * invitation if they never accepted one). Returned once, handed over by hand.
   */
  app.post('/people/:id/password-reset', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'account.manage', institutionScope()))) return reply;
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return sendFailure(reply, fail('NOT_FOUND', 'That person was not found.'));
    const result = await issuePasswordReset(c.passwordReset, actorOf(req), { personId: id });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, {
      kind: result.value.kind,
      token: result.value.token,
      expires_at: result.value.expiresAt.toISOString(),
      delivery: 'pending',
    }, 201);
  });

  /*
   * ST-1 (AD-69): app access for a student, from their record. Returns a
   * one-time activation code, once, to print or hand over. The account it
   * creates takes a seat (AD-65).
   */
  app.post('/students/:id/access', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'student.manage', institutionScope()))) return reply;
    if (!(await requirePermission(c, req, reply, 'account.manage', institutionScope()))) return reply;
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return sendFailure(reply, fail('NOT_FOUND', 'That student was not found.'));
    const result = await issueStudentAccess(c.studentAccess, actorOf(req), { studentId: id });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, {
      kind: result.value.kind,
      code: result.value.code,
      expires_at: result.value.expiresAt.toISOString(),
      login_identifier: result.value.loginIdentifier,
      delivery: 'pending',
    }, 201);
  });

  app.get('/assignments', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'audit.read', institutionScope()))) return reply;
    const rows = await listAssignments(c.managePeople, actorOf(req));
    return sendOk(reply, rows.map((a) => ({
      id: a.id,
      person_id: a.personId,
      person_name: a.personName,
      role_key: a.roleKey,
      role_name: a.roleName,
      scope_type: a.scopeType,
      scope_ref_id: a.scopeRefId,
      valid_to: a.validTo,
      source: a.source,
      granted_at: a.grantedAt,
    })));
  });

  app.post('/assignments', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'role.assign', institutionScope()))) return reply;
    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));

    const result = await assignRole(c.managePeople, actorOf(req), {
      personId: parsed.data.person_id,
      roleKey: parsed.data.role_key,
      scopeType: parsed.data.scope_type as ScopeType,
      scopeRefId: parsed.data.scope_ref_id ?? null,
      validTo: parsed.data.valid_to ? new Date(parsed.data.valid_to) : null,
      reason: parsed.data.reason ?? null,
    });

    if (!result.ok) return sendFailure(reply, result.error);
    // AD-16: the change must reach the person's next request, not wait out the
    // cache ceiling.
    c.authority.invalidate(parsed.data.person_id);
    return sendResult(reply, result, 201);
  });

  app.post('/assignments/:id/revoke', async (req, reply) => {
    if (!(await requirePermission(c, req, reply, 'role.assign', institutionScope()))) return reply;
    const parsed = revokeBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, validationFailure(parsed.error.issues));

    const { id } = req.params as { id: string };
    const before = await c.uow.run(req.actor!.tenantId, (tx) =>
      c.roleAssignments.findActiveById(tx, id));

    const result = await revokeAssignment(c.managePeople, actorOf(req), {
      assignmentId: id,
      reason: parsed.data.reason,
    });

    if (!result.ok) return sendFailure(reply, result.error);
    if (before) c.authority.invalidate(before.personId);
    return sendOk(reply, { revoked: true });
  });
}

/** Turns permission keys into one readable sentence for the assign drawer. */
function summarise(keys: string[]): string {
  const groups: Array<[string, string]> = [
    ['role.assign', 'grant and remove access'],
    ['person.manage', 'add and edit people'],
    ['person.export', 'export personal data'],
    ['account.manage', 'invite and deactivate accounts'],
    ['institution.manage', 'change college settings'],
    ['audit.read', 'read the audit trail'],
    ['person.read', 'view people'],
  ];
  const held = groups.filter(([key]) => keys.includes(key)).map(([, label]) => label);
  if (held.length === 0) return 'No access yet';
  if (held.length === 1) return `Can ${held[0]}`;
  return `Can ${held.slice(0, -1).join(', ')} and ${held[held.length - 1]}`;
}

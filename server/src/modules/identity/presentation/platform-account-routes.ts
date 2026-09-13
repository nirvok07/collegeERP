import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk } from '../../../infrastructure/http/server.ts';
import { requirePlatformPermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import {
  changePlatformRole, createPlatformAccount, getPlatformAccount, listPlatformAccounts,
  setPlatformAccountStatus, type PlatformAccountView,
} from '../application/manage-platform-accounts.ts';

const createBody = z.object({
  email: z.string().max(254),
  full_name: z.string().max(200),
  role: z.string().max(20),
});
const reasonBody = z.object({ reason: z.string().max(500) });
const roleBody = z.object({
  role: z.string().max(20),
  expected_role: z.string().max(20).nullable(),
  reason: z.string().max(500),
});

function viewJson(v: PlatformAccountView) {
  const a = v.account;
  return {
    id: a.id, email: a.email, full_name: a.fullName, status: a.status, role: a.role,
    last_login_at: a.lastLoginAt, created_at: a.createdAt, is_you: v.isYou,
    actions: v.actions,
    role_history: v.history.map((h) => ({
      role: h.role, granted_at: h.grantedAt, ended_at: h.endedAt, reason: h.reason,
    })),
  };
}

/**
 * SA-3a: platform accounts and roles. Owner-only by permission; Support holds
 * none of these. No response carries a credential or any secret.
 */
export async function registerPlatformAccountRoutes(app: FastifyInstance, c: Container) {
  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };
  const idOf = (req: { params: unknown }) => (req.params as { id: string }).id;
  const validId = (id: string) => z.string().uuid().safeParse(id).success;
  const notFound = fail('NOT_FOUND', 'That platform account was not found.');

  app.get('/platform/accounts', async (req, reply) => {
    const who = await requirePlatformPermission(c, req, reply, 'platform.accounts.read');
    if (!who) return reply;
    const rows = await listPlatformAccounts(c.managePlatformAccounts);
    return sendOk(reply, rows.map((a) => ({
      id: a.id, email: a.email, full_name: a.fullName, status: a.status, role: a.role,
      last_login_at: a.lastLoginAt, created_at: a.createdAt, is_you: a.id === who.accountId,
    })));
  });

  app.get('/platform/accounts/:id', async (req, reply) => {
    const who = await requirePlatformPermission(c, req, reply, 'platform.accounts.read');
    if (!who) return reply;
    if (!validId(idOf(req))) return sendFailure(reply, notFound);
    const result = await getPlatformAccount(c.managePlatformAccounts, { id: who.accountId, permissions: who.permissions }, idOf(req));
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, viewJson(result.value));
  });

  app.post('/platform/accounts', async (req, reply) => {
    const who = await requirePlatformPermission(c, req, reply, 'platform.accounts.manage');
    if (!who) return reply;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const result = await createPlatformAccount(c.managePlatformAccounts, { id: who.accountId, permissions: who.permissions }, {
      email: parsed.data.email, fullName: parsed.data.full_name, role: parsed.data.role,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, viewJson(result.value), 201);
  });

  for (const action of ['disable', 'enable'] as const) {
    app.post(`/platform/accounts/:id/${action}`, async (req, reply) => {
      const who = await requirePlatformPermission(c, req, reply, 'platform.accounts.manage');
      if (!who) return reply;
      if (!validId(idOf(req))) return sendFailure(reply, notFound);
      const parsed = reasonBody.safeParse(req.body);
      if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
      const result = await setPlatformAccountStatus(c.managePlatformAccounts, { id: who.accountId, permissions: who.permissions }, {
        id: idOf(req), action, reason: parsed.data.reason,
      });
      if (!result.ok) return sendFailure(reply, result.error);
      return sendOk(reply, viewJson(result.value));
    });
  }

  app.post('/platform/accounts/:id/role', async (req, reply) => {
    const who = await requirePlatformPermission(c, req, reply, 'platform.roles.manage');
    if (!who) return reply;
    if (!validId(idOf(req))) return sendFailure(reply, notFound);
    const parsed = roleBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    const result = await changePlatformRole(c.managePlatformAccounts, { id: who.accountId, permissions: who.permissions }, {
      id: idOf(req), role: parsed.data.role, expectedRole: parsed.data.expected_role, reason: parsed.data.reason,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, viewJson(result.value));
  });
}

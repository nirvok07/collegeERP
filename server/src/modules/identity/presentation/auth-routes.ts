import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import {
  ipHashOf, refreshCookieOptions, REFRESH_COOKIE, sendFailure, sendOk, sendResult,
} from '../../../infrastructure/http/server.ts';
import { fail } from '../../../core/errors.ts';
import { authenticatePlatformUser, authenticateTenantUser } from '../application/authenticate.ts';
import { acceptInvitation } from '../application/accept-invitation.ts';
import { endSession, refreshSession } from '../application/refresh-session.ts';

const platformLogin = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const tenantLogin = z.object({
  institution_code: z.string().min(1),
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const accept = z.object({
  institution_code: z.string().min(1),
  token: z.string().min(1),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance, c: Container) {
  app.post('/auth/platform/login', async (req, reply) => {
    const parsed = platformLogin.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter your email and password.'));
    }
    const result = await authenticatePlatformUser(c.authenticate, {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      ipHash: ipHashOf(req),
    });
    if (result.ok) {
      reply.setCookie(REFRESH_COOKIE, result.value.tokens.refreshToken, refreshCookieOptions(c.config));
    }
    return sendResult(reply, mapTokens(result), 200, req.log.warn.bind(req.log));
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = tenantLogin.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter your institution, username and password.'));
    }
    const tenantId = await resolveTenantId(c, parsed.data.institution_code);
    if (!tenantId) {
      // Same failure as a bad credential: whether an institution code exists is
      // not something an unauthenticated caller gets to enumerate.
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Those sign-in details are not correct.'));
    }
    const result = await authenticateTenantUser(c.authenticate, {
      tenantId,
      identifier: parsed.data.identifier.toLowerCase(),
      password: parsed.data.password,
      ipHash: ipHashOf(req),
    });
    if (result.ok) {
      reply.setCookie(REFRESH_COOKIE, result.value.tokens.refreshToken, refreshCookieOptions(c.config));
    }
    return sendResult(reply, mapTokens(result), 200, req.log.warn.bind(req.log));
  });

  app.post('/auth/accept-invite', async (req, reply) => {
    const parsed = accept.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(reply, fail('VALIDATION_FAILED', 'Provide the invitation and a new password.'));
    }
    const tenantId = await resolveTenantId(c, parsed.data.institution_code);
    if (!tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'This invitation link is no longer valid.'));
    }
    const result = await acceptInvitation(c.acceptInvitation, {
      tenantId,
      token: parsed.data.token,
      password: parsed.data.password,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, { account_id: result.value.accountId });
  });

  /**
   * Session renewal. Both clients use this endpoint and the same rotation rules.
   *
   * The browser sends nothing: the refresh token rides in an httpOnly cookie it
   * cannot read. Flutter sends the token in the body, because a mobile app has
   * no cookie jar worth relying on and keeps the token in platform secure
   * storage instead. One mechanism, two transports.
   */
  app.post('/auth/refresh', async (req, reply) => {
    const fromCookie = req.cookies[REFRESH_COOKIE];
    const fromBody = (req.body as { refresh_token?: string } | undefined)?.refresh_token;
    const presented = fromCookie ?? fromBody;

    if (!presented) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Your session has ended. Please sign in again.'));
    }

    const result = await refreshSession(c.refreshSession, {
      refreshToken: presented,
      ipHash: ipHashOf(req),
    });

    if (!result.ok) {
      // The session cannot be renewed, so clear the cookie rather than leaving
      // the browser to present a dead token on every future request.
      reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions(c.config));
      return sendFailure(reply, result.error);
    }

    reply.setCookie(REFRESH_COOKIE, result.value.tokens.refreshToken, refreshCookieOptions(c.config));
    return sendResult(reply, mapTokens(result), 200);
  });

  /** Explicit sign-out ends the whole token family, not just this device's token. */
  app.post('/auth/logout', async (req, reply) => {
    const presented =
      req.cookies[REFRESH_COOKIE] ?? (req.body as { refresh_token?: string } | undefined)?.refresh_token;
    if (presented) await endSession(c.refreshSession, { refreshToken: presented });
    reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions(c.config));
    return sendOk(reply, { signed_out: true });
  });

  /**
   * AD-18. A person with no assignment gets a designed "no access yet" answer,
   * never an error, because that is normal on a first day.
   */
  app.get('/auth/me', async (req, reply) => {
    if (!req.actor) return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));

    if (req.actor.actorType === 'platform') {
      return sendOk(reply, {
        actor_type: 'platform',
        actor_id: req.actor.sub,
        tenant_id: null,
        permissions: ['platform.tenant.manage'],
        has_access: true,
      });
    }

    const authority = await c.authority.authorityFor(req.actor.tenantId!, req.actor.sub);
    return sendOk(reply, {
      actor_type: 'person',
      actor_id: req.actor.sub,
      tenant_id: req.actor.tenantId,
      permissions: [...c.authority.permissions(authority)].sort(),
      assignments: authority.assignments.map((a) => ({
        role_key: a.roleKey,
        scope_type: a.scope.type,
        scope_ref_id: a.scope.refId,
        valid_to: a.validTo,
      })),
      has_access: !c.authority.hasNoAccess(authority),
    });
  });
}

async function resolveTenantId(c: Container, code: string): Promise<string | null> {
  const institution = await c.uow.run(null, (tx) => c.institutions.findByCode(tx, code.toLowerCase()));
  if (!institution) return null;
  if (institution.status === 'suspended' || institution.status === 'closed') return null;
  return institution.id;
}

function mapTokens(
  result: Awaited<ReturnType<typeof authenticatePlatformUser | typeof refreshSession>>,
) {
  if (!result.ok) return result;
  const { actor, tokens } = result.value;
  return {
    ok: true as const,
    value: {
      actor: {
        actor_type: actor.actorType,
        actor_id: actor.actorId,
        tenant_id: actor.tenantId,
        full_name: actor.fullName,
      },
      access_token: tokens.accessToken,
      access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
      refresh_token: tokens.refreshToken,
      refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
    },
  };
}

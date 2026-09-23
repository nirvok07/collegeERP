import { platformPermissions } from '../domain/platform-authority.ts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import {
  ipHashOf, refreshCookieOptions, REFRESH_COOKIE, sendFailure, sendOk, sendResult,
} from '../../../infrastructure/http/server.ts';
import { fail } from '../../../core/errors.ts';
import { authenticatePlatformUser, authenticateTenantUser } from '../application/authenticate.ts';
import { acceptInvitation } from '../application/accept-invitation.ts';
import {
  acceptPlatformInvitation, beginTotpEnrolment, completePlatformSignIn, confirmTotpEnrolment,
  type PlatformChallenge,
} from '../application/platform-mfa.ts';
import { endSession, refreshSession } from '../application/refresh-session.ts';
import { changePassword } from '../application/change-password.ts';
import { normaliseActivationCode, studentLoginIdentifier } from '../application/student-access.ts';
import { registerDevice, revokeDevicesForAccount } from '../application/manage-devices.ts';
import {
  requestCollegeCode, requestPlatformCode, verifyCollegeCode, verifyPlatformCode, type CodeRequested,
} from '../application/otp-sign-in.ts';

// AD-82: sign-in by a one-time code to the person's email or mobile.
const codeRequest = z.object({
  institution_code: z.string().min(1).max(64),
  identifier: z.string().min(1).max(254),
});
const codeVerify = z.object({
  institution_code: z.string().min(1).max(64),
  challenge_token: z.string().min(10).max(200),
  code: z.string().min(1).max(12),
});
const platformCodeRequest = z.object({ email: z.string().email().max(254) });
const platformCodeVerify = z.object({
  challenge_token: z.string().min(10).max(200),
  code: z.string().min(1).max(12),
});
const codeJson = (r: CodeRequested) => ({
  challenge_token: r.challengeToken, expires_at: r.expiresAt.toISOString(), destination: r.destination,
});

const platformLogin = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const challengeBody = z.object({ challenge_token: z.string().min(10).max(200) });
const codeBody = challengeBody.extend({ code: z.string().max(12) });
const platformAccept = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) });
const studentActivateBody = z.object({
  institution_code: z.string().min(1).max(64),
  enrolment_number: z.string().min(1).max(40),
  code: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
});
const passwordBody = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(1).max(200),
});

const stepJson = (s: PlatformChallenge) => ({
  step: s.step, challenge_token: s.challengeToken, expires_at: s.expiresAt.toISOString(),
});

const tenantLogin = z.object({
  institution_code: z.string().min(1),
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const deviceBody = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  push_token: z.string().min(8).max(4096),
  app_version: z.string().max(40).optional(),
  device_label: z.string().max(80).optional(),
});

const accept = z.object({
  institution_code: z.string().min(1),
  token: z.string().min(1),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance, c: Container) {
  /* ------------------------------------------------- AD-82: sign-in by code */

  app.post('/auth/otp/request', async (req, reply) => {
    const parsed = codeRequest.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter your email or mobile number.'));
    const tenantId = await resolveTenantId(c, parsed.data.institution_code);
    // As for passwords: whether a college code exists is not for an
    // unauthenticated caller to learn.
    if (!tenantId) return sendFailure(reply, fail('UNAUTHENTICATED', 'Those sign-in details are not correct.'));
    const result = await requestCollegeCode(c.otpSignIn, { tenantId, identifier: parsed.data.identifier });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, codeJson(result.value));
  });

  app.post('/auth/otp/verify', async (req, reply) => {
    const parsed = codeVerify.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter the six-digit code.'));
    const tenantId = await resolveTenantId(c, parsed.data.institution_code);
    if (!tenantId) return sendFailure(reply, fail('UNAUTHENTICATED', 'This code has expired. Ask for a new one.'));
    const result = await verifyCollegeCode(c.otpSignIn, {
      tenantId, challengeToken: parsed.data.challenge_token, code: parsed.data.code, ipHash: ipHashOf(req),
    });
    if (result.ok) {
      reply.setCookie(REFRESH_COOKIE, result.value.tokens.refreshToken, refreshCookieOptions(c.config));
    }
    return sendResult(reply, mapTokens(result), 200, req.log.warn.bind(req.log));
  });

  app.post('/auth/platform/otp/request', async (req, reply) => {
    const parsed = platformCodeRequest.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter your email.'));
    const result = await requestPlatformCode(c.otpSignIn, { email: parsed.data.email });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, codeJson(result.value));
  });

  app.post('/auth/platform/otp/verify', async (req, reply) => {
    const parsed = platformCodeVerify.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter the six-digit code.'));
    const result = await verifyPlatformCode(c.otpSignIn, {
      challengeToken: parsed.data.challenge_token, code: parsed.data.code, ipHash: ipHashOf(req),
    });
    if (result.ok) {
      reply.setCookie(REFRESH_COOKIE, result.value.tokens.refreshToken, refreshCookieOptions(c.config));
    }
    return sendResult(reply, mapTokens(result), 200, req.log.warn.bind(req.log));
  });

  /* ------------------------------------------------ passwords (until OTP-5) */

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
    // SA-3b: never tokens here, only the next step (AD-62).
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, stepJson(result.value));
  });

  app.post('/auth/platform/second-factor', async (req, reply) => {
    const parsed = codeBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter the six-digit code.'));
    const result = await completePlatformSignIn(c.platformMfa, {
      challengeToken: parsed.data.challenge_token, code: parsed.data.code, ipHash: ipHashOf(req),
    });
    if (result.ok) {
      reply.setCookie(REFRESH_COOKIE, result.value.tokens.refreshToken, refreshCookieOptions(c.config));
    }
    return sendResult(reply, mapTokens(result), 200, req.log.warn.bind(req.log));
  });

  app.post('/auth/platform/accept-invite', async (req, reply) => {
    const parsed = platformAccept.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Provide the invitation and a new password.'));
    const result = await acceptPlatformInvitation(c.platformMfa, { token: parsed.data.token, password: parsed.data.password });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, stepJson(result.value));
  });

  // The secret leaves the server here only, once per setup attempt.
  app.post('/auth/platform/enrolment', async (req, reply) => {
    const parsed = challengeBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'This setup has expired. Start again.'));
    const result = await beginTotpEnrolment(c.platformMfa, { challengeToken: parsed.data.challenge_token });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, {
      otpauth_uri: result.value.otpauthUri,
      manual_key: result.value.manualKey,
      expires_at: result.value.expiresAt.toISOString(),
    });
  });

  app.post('/auth/platform/enrolment/confirm', async (req, reply) => {
    const parsed = codeBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter the six-digit code.'));
    const result = await confirmTotpEnrolment(c.platformMfa, {
      challengeToken: parsed.data.challenge_token, code: parsed.data.code,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, { enrolled: true });
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
   * ST-1 (AD-69): a student activates with the college code, their enrolment
   * number and the one-time code from their college, and sets a password. The
   * code opens only the account of that enrolment number; one answer for every
   * wrong combination. A later code redeems a forgotten password the same way.
   */
  app.post('/auth/student-activate', async (req, reply) => {
    const parsed = studentActivateBody.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter your enrolment number, the code and a new password.'));
    }
    const invalid = fail('UNAUTHENTICATED', 'This code is no longer valid. Ask for a new one.');
    const tenantId = await resolveTenantId(c, parsed.data.institution_code);
    if (!tenantId) return sendFailure(reply, invalid);
    const loginIdentifier = studentLoginIdentifier(parsed.data.enrolment_number);
    const result = await acceptInvitation(c.acceptInvitation, {
      tenantId,
      token: normaliseActivationCode(parsed.data.code),
      password: parsed.data.password,
      loginIdentifier,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, { activated: true, login_identifier: loginIdentifier });
  });

  /**
   * ADM-1: a college account changes its own password. Every session of the
   * account then ends, this one included, so the cookie is cleared too.
   */
  app.post('/auth/password', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId || !req.actor.accountId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const parsed = passwordBody.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(reply, fail('VALIDATION_FAILED', 'Enter your current password and a new one.'));
    }
    const result = await changePassword(c.changePassword, {
      tenantId: req.actor.tenantId,
      accountId: req.actor.accountId,
      personId: req.actor.sub,
      currentPassword: parsed.data.current_password,
      newPassword: parsed.data.new_password,
    });
    if (!result.ok) return sendFailure(reply, result.error);
    reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions(c.config));
    return sendOk(reply, { changed: true, signed_out: true });
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

  /**
   * Registers where this user can be reached by push.
   *
   * The ERP decides who is notified and why; this records only the address.
   * Re-registering the same device re-points it at the current account, which
   * is what stops a shared handset delivering the previous user's notifications.
   */
  app.post('/devices', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId || !req.actor.accountId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const parsed = deviceBody.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(reply, fail('VALIDATION_FAILED', 'That device registration is not valid.'));
    }

    const result = await registerDevice(c.manageDevices, {
      tenantId: req.actor.tenantId,
      personId: req.actor.sub,
      accountId: req.actor.accountId,
      platform: parsed.data.platform,
      pushToken: parsed.data.push_token,
      appVersion: parsed.data.app_version ?? null,
      deviceLabel: parsed.data.device_label ?? null,
    });

    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, { device_id: result.value.deviceId }, 201);
  });

  /**
   * Explicit sign-out ends the whole token family, not just this device's token,
   * and stops push to that account. A shared device must leak nothing to the
   * next person, per the security documentation.
   */
  app.post('/auth/logout', async (req, reply) => {
    const presented =
      req.cookies[REFRESH_COOKIE] ?? (req.body as { refresh_token?: string } | undefined)?.refresh_token;

    let revoked = false;
    if (req.actor?.actorType === 'person' && req.actor.tenantId && req.actor.accountId) {
      await revokeDevicesForAccount(c.manageDevices, {
        tenantId: req.actor.tenantId,
        accountId: req.actor.accountId,
        personId: req.actor.sub,
        reason: 'signed_out',
      });
      revoked = true;
    }

    if (presented) {
      const ended = await endSession(c.refreshSession, { refreshToken: presented });
      // The mobile app signs out with its refresh token alone, after its access
      // token is already gone. That token names the account, so its devices are
      // revoked here too (docs/08): a signed-out phone receives nothing.
      const owner = ended.ok ? ended.value.account : null;
      if (!revoked && owner) {
        await revokeDevicesForAccount(c.manageDevices, { ...owner, reason: 'signed_out' });
      }
    }
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
      // SA-3a: permissions from the account's live role, never a fixed set.
      const found = await c.platformAuthority.forAccount(req.actor.sub);
      // AD-82 supersedes AD-62: an active account, however it signed in.
      if (!found || found.status !== 'active') {
        return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
      }
      const permissions = [...platformPermissions(found.role)].sort();
      return sendOk(reply, {
        actor_type: 'platform',
        actor_id: req.actor.sub,
        tenant_id: null,
        platform_role: found.role,
        permissions,
        has_access: permissions.length > 0,
      });
    }

    const authority = await c.authority.authorityFor(req.actor.tenantId!, req.actor.sub);
    // UX-2: who the person is, which only the app's Profile shows.
    const tenantId = req.actor.tenantId!;
    const personId = req.actor.sub;
    const accountId = req.actor.accountId ?? null;
    const who = await c.uow.run(tenantId, async (tx) => ({
      person: await c.managePeople.persons.findById(tx, personId),
      account: accountId ? await c.managePeople.accounts.findById(tx, accountId) : null,
      student: await c.studentSelf.whoAmI(tx, personId),
    }));
    // UX-2 / owner feedback: "Faculty for a department" told nobody which
    // department. Resolved per assignment rather than joined generically,
    // because each scope type names a different table.
    const scopeNames = await c.uow.run(tenantId, async (tx) => {
      const names = new Map<string, string>();
      for (const a of authority.assignments) {
        const refId = a.scope.refId;
        if (!refId || names.has(refId)) continue;
        const name = await (async () => {
          switch (a.scope.type) {
            case 'campus': return (await c.manageOrg.campuses.findById(tx, refId))?.name ?? null;
            case 'department': return (await c.manageOrg.departments.findById(tx, refId))?.name ?? null;
            case 'program': return (await c.curriculum.programs.findById(tx, refId))?.name ?? null;
            case 'section': {
              const section = await c.enrolment.sections.findById(tx, refId);
              return section ? `Section ${section.label}` : null;
            }
            default: return null;
          }
        })();
        if (name) names.set(refId, name);
      }
      return names;
    });
    return sendOk(reply, {
      actor_type: 'person',
      actor_id: req.actor.sub,
      tenant_id: req.actor.tenantId,
      full_name: who.person?.fullName ?? null,
      login_identifier: who.account?.loginIdentifier ?? null,
      // ST-1: present only for a student. Their own surfaces follow from being
      // the student, self-scoped, never from a role.
      student: who.student && {
        id: who.student.id,
        enrolment_number: who.student.enrolmentNumber,
        status: who.student.status,
        program_name: who.student.programName,
        section_label: who.student.sectionLabel,
        section_term_number: who.student.sectionTermNumber,
      },
      permissions: [...c.authority.permissions(authority)].sort(),
      assignments: authority.assignments.map((a) => ({
        role_key: a.roleKey,
        scope_type: a.scope.type,
        scope_ref_id: a.scope.refId,
        scope_name: a.scope.refId ? (scopeNames.get(a.scope.refId) ?? null) : null,
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
  result: Awaited<ReturnType<typeof completePlatformSignIn | typeof refreshSession>>,
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

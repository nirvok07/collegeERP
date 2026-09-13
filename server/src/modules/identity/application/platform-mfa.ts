/**
 * SA-3b: the platform's second factor (AD-62) with sealed secrets (AD-63).
 *
 * A password alone never opens a platform session. It yields a short,
 * single-use challenge: either for a code, or for enrolment when no
 * authenticator is set up yet. Only a correct, fresh code issues the normal
 * session (the same tokens and refresh family as before). Wrong codes count
 * toward the account's existing lockout; a correct password does not reset it.
 */
import { createHash } from 'node:crypto';
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, PasswordHasher, TokenIssuer } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { LoginAttemptRepository, PlatformAccountRepository, RefreshTokenRepository } from './ports.ts';
import type { PlatformAccountStatus, PlatformAdminRepository } from './manage-platform-accounts.ts';
import type { SecretSealer } from '../../../infrastructure/crypto/secret-sealer.ts';
import type { TotpService } from '../../../infrastructure/crypto/totp.ts';
import { afterFailedAttempt, evaluateSignIn, validatePassword } from '../domain/account-policy.ts';
import {
  CHALLENGE_MAX_ATTEMPTS, ENROLMENT_TTL_SECONDS, SECOND_FACTOR_TTL_SECONDS,
  pendingTotpContext, totpContext,
} from '../domain/totp-policy.ts';
import { issueTokens, type AuthTokens, type SignedInActor } from './authenticate.ts';

export type ChallengePurpose = 'second_factor' | 'enrolment';

export interface PlatformCredentialState {
  id: string;
  email: string;
  fullName: string;
  status: PlatformAccountStatus;
  hasCredential: boolean;
  totpSealed: string | null;
  pendingSealed: string | null;
  enrolledAt: Date | null;
  lastStep: number | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface PlatformMfaRepository {
  state(tx: Tx, id: string): Promise<PlatformCredentialState | null>;
  stateByEmail(tx: Tx, email: string): Promise<PlatformCredentialState | null>;
  setCredential(tx: Tx, id: string, hash: string): Promise<void>;
  setPending(tx: Tx, id: string, sealed: string | null): Promise<void>;
  completeEnrolment(tx: Tx, id: string, sealed: string, step: number): Promise<void>;
  recordStep(tx: Tx, id: string, step: number): Promise<void>;
  resetTotp(tx: Tx, id: string): Promise<void>;
  createChallenge(tx: Tx, input: { id: string; accountId: string; purpose: ChallengePurpose; tokenHash: string; expiresAt: Date }): Promise<void>;
  findChallenge(tx: Tx, tokenHash: string): Promise<{
    id: string; accountId: string; purpose: ChallengePurpose; expiresAt: Date; consumedAt: Date | null; attempts: number;
  } | null>;
  consumeChallenge(tx: Tx, id: string, at: Date): Promise<void>;
  failChallenge(tx: Tx, id: string): Promise<number>;
  revokeChallenges(tx: Tx, accountId: string, at: Date): Promise<void>;
  issueInvitation(tx: Tx, input: { id: string; accountId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findInvitation(tx: Tx, tokenHash: string, at: Date): Promise<{ id: string; accountId: string } | null>;
  consumeInvitation(tx: Tx, id: string, at: Date): Promise<void>;
  revokeInvitations(tx: Tx, accountId: string, at: Date): Promise<number>;
}

export interface PlatformMfaDeps {
  uow: UnitOfWork;
  mfa: PlatformMfaRepository;
  platformAccounts: PlatformAccountRepository;
  platformAdmin: PlatformAdminRepository;
  refreshTokens: RefreshTokenRepository;
  loginAttempts: LoginAttemptRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  sealer: SecretSealer;
  totp: TotpService;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  refreshTtlDays: number;
}

export interface PlatformChallenge {
  step: ChallengePurpose;
  challengeToken: string;
  expiresAt: Date;
}

const EXPIRED = 'This sign-in has expired. Start again.';
const WRONG_CODE = 'That code is not correct.';
const hashIdentifier = (v: string) => createHash('sha256').update(v.toLowerCase()).digest('hex');

/**
 * Issues the one live challenge for an account. Any earlier one is spent, so
 * challenges cannot be stockpiled to multiply guesses.
 */
export async function issueChallenge(
  deps: Pick<PlatformMfaDeps, 'mfa' | 'tokens' | 'ids'>,
  tx: Tx,
  accountId: string,
  purpose: ChallengePurpose,
  at: Date,
): Promise<PlatformChallenge> {
  await deps.mfa.revokeChallenges(tx, accountId, at);
  const { token, hash } = deps.tokens.issueOpaqueToken();
  const ttl = purpose === 'second_factor' ? SECOND_FACTOR_TTL_SECONDS : ENROLMENT_TTL_SECONDS;
  const expiresAt = new Date(at.getTime() + ttl * 1000);
  await deps.mfa.createChallenge(tx, { id: deps.ids.next(), accountId, purpose, tokenHash: hash, expiresAt });
  return { step: purpose, challengeToken: token, expiresAt };
}

async function liveChallenge(deps: PlatformMfaDeps, tx: Tx, token: string, purpose: ChallengePurpose, at: Date) {
  const found = await deps.mfa.findChallenge(tx, deps.tokens.hashOpaqueToken(token));
  if (!found || found.purpose !== purpose || found.consumedAt || found.expiresAt.getTime() <= at.getTime()) return null;
  return found;
}

/** Completes a platform sign-in with the code. The only way to a platform session. */
export async function completePlatformSignIn(
  deps: PlatformMfaDeps,
  input: { challengeToken: string; code: string; ipHash?: string | null },
): Promise<Result<{ actor: SignedInActor; tokens: AuthTokens }>> {
  const at = deps.clock.now();
  return deps.uow.run(null, async (tx) => {
    const challenge = await liveChallenge(deps, tx, input.challengeToken, 'second_factor', at);
    if (!challenge) return Err(fail('UNAUTHENTICATED', EXPIRED));
    const account = await deps.mfa.state(tx, challenge.accountId);
    if (!account || account.status !== 'active' || !account.totpSealed) {
      await deps.mfa.consumeChallenge(tx, challenge.id, at);
      return Err(fail('UNAUTHENTICATED', EXPIRED));
    }
    const security = { status: 'active' as const, failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil };
    const decision = evaluateSignIn(security, at);
    if (decision.kind === 'locked') {
      await deps.mfa.consumeChallenge(tx, challenge.id, at);
      return Err(fail('ACCOUNT_LOCKED', `Too many attempts. Try again after ${decision.until.toISOString()}.`));
    }

    let secret: string;
    try {
      secret = deps.sealer.open(account.totpSealed, totpContext(account.id));
    } catch {
      // Fails closed: an unreadable secret never means "let them in".
      await deps.mfa.consumeChallenge(tx, challenge.id, at);
      return Err(fail('UNAUTHENTICATED', 'Two-step verification cannot be checked for this account. Ask an Owner to reset its authenticator.'));
    }

    const check = deps.totp.verify(secret, input.code.trim(), at);
    const fresh = check.valid && check.timeStep !== null
      && (account.lastStep === null || check.timeStep > account.lastStep);
    if (!fresh) {
      const attempts = await deps.mfa.failChallenge(tx, challenge.id);
      if (attempts >= CHALLENGE_MAX_ATTEMPTS) await deps.mfa.consumeChallenge(tx, challenge.id, at);
      const next = afterFailedAttempt(security, at);
      await deps.platformAccounts.updateSecurityState(tx, account.id, {
        failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil, status: account.status,
      });
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(), tenantId: null, identifierHash: hashIdentifier(account.email),
        accountId: account.id, outcome: 'failure', failureReason: 'bad_second_factor', ipHash: input.ipHash ?? null,
      });
      return Err(fail('UNAUTHENTICATED', WRONG_CODE));
    }

    await deps.mfa.consumeChallenge(tx, challenge.id, at);
    await deps.mfa.recordStep(tx, account.id, check.timeStep!);
    await deps.platformAccounts.updateSecurityState(tx, account.id, { failedAttempts: 0, lockedUntil: null, status: account.status });
    await deps.platformAccounts.recordSignIn(tx, account.id, at);
    await deps.loginAttempts.record(tx, {
      id: deps.ids.next(), tenantId: null, identifierHash: hashIdentifier(account.email),
      accountId: account.id, outcome: 'success', failureReason: null, ipHash: input.ipHash ?? null,
    });
    const tokens = await issueTokens(deps, tx, {
      sub: account.id, actorType: 'platform', tenantId: null, accountId: null,
    }, { platformAccountId: account.id, accountId: null, tenantId: null }, at);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: account.id,
      action: 'auth.signed_in', subjectType: 'platform_account', subjectId: account.id,
      after: { second_factor: 'totp' }, ipHash: input.ipHash ?? null,
    }, tx);
    return Ok({
      actor: { actorType: 'platform' as const, actorId: account.id, tenantId: null, accountId: null, fullName: account.fullName },
      tokens,
    });
  });
}

/** An invited account sets its password; enrolment follows at once. */
export async function acceptPlatformInvitation(
  deps: PlatformMfaDeps,
  input: { token: string; password: string },
): Promise<Result<PlatformChallenge>> {
  const problem = validatePassword(input.password);
  if (problem) return Err(fail('VALIDATION_FAILED', problem, { fieldErrors: { password: problem } }));
  const at = deps.clock.now();
  const invalid = fail('UNAUTHENTICATED', 'This invitation link is no longer valid. Ask an Owner for a new one.');
  return deps.uow.run(null, async (tx) => {
    const invitation = await deps.mfa.findInvitation(tx, deps.tokens.hashOpaqueToken(input.token), at);
    if (!invitation) return Err(invalid);
    const account = await deps.mfa.state(tx, invitation.accountId);
    if (!account || account.status !== 'invited') return Err(invalid);
    await deps.mfa.setCredential(tx, account.id, await deps.hasher.hash(input.password));
    await deps.mfa.consumeInvitation(tx, invitation.id, at);
    const challenge = await issueChallenge(deps, tx, account.id, 'enrolment', at);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: account.id,
      action: 'platform_account.invitation_accepted', subjectType: 'platform_account', subjectId: account.id,
    }, tx);
    return Ok(challenge);
  });
}

/** Generates the secret, seals it as pending, and shows it once, here only. */
export async function beginTotpEnrolment(
  deps: PlatformMfaDeps,
  input: { challengeToken: string },
): Promise<Result<{ otpauthUri: string; manualKey: string; expiresAt: Date }>> {
  const at = deps.clock.now();
  return deps.uow.run(null, async (tx) => {
    const challenge = await liveChallenge(deps, tx, input.challengeToken, 'enrolment', at);
    if (!challenge) return Err(fail('UNAUTHENTICATED', EXPIRED));
    const account = await deps.mfa.state(tx, challenge.accountId);
    if (!account || !['invited', 'active'].includes(account.status) || !account.hasCredential || account.totpSealed) {
      return Err(fail('UNAUTHENTICATED', EXPIRED));
    }
    const secret = deps.totp.newSecret();
    await deps.mfa.setPending(tx, account.id, deps.sealer.seal(secret, pendingTotpContext(account.id)));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: account.id,
      action: 'platform_account.mfa_enrolment_started', subjectType: 'platform_account', subjectId: account.id,
    }, tx);
    return Ok({ otpauthUri: deps.totp.uri(secret, account.email), manualKey: secret, expiresAt: challenge.expiresAt });
  });
}

/** A correct code from the new authenticator completes enrolment. Sign in afterwards. */
export async function confirmTotpEnrolment(
  deps: PlatformMfaDeps,
  input: { challengeToken: string; code: string },
): Promise<Result<{ enrolled: true }>> {
  const at = deps.clock.now();
  return deps.uow.run(null, async (tx) => {
    const challenge = await liveChallenge(deps, tx, input.challengeToken, 'enrolment', at);
    if (!challenge) return Err(fail('UNAUTHENTICATED', EXPIRED));
    const account = await deps.mfa.state(tx, challenge.accountId);
    if (!account || account.totpSealed || !account.pendingSealed) {
      return Err(fail('CONFLICT', 'Start the authenticator setup again.'));
    }
    let secret: string;
    try {
      secret = deps.sealer.open(account.pendingSealed, pendingTotpContext(account.id));
    } catch {
      await deps.mfa.setPending(tx, account.id, null);
      return Err(fail('CONFLICT', 'Start the authenticator setup again.'));
    }
    const check = deps.totp.verify(secret, input.code.trim(), at);
    if (!check.valid || check.timeStep === null) {
      const attempts = await deps.mfa.failChallenge(tx, challenge.id);
      if (attempts >= CHALLENGE_MAX_ATTEMPTS) await deps.mfa.consumeChallenge(tx, challenge.id, at);
      return Err(fail('UNAUTHENTICATED', 'That code is not correct. Check the time on your phone and try again.'));
    }
    await deps.mfa.completeEnrolment(tx, account.id, deps.sealer.seal(secret, totpContext(account.id)), check.timeStep);
    await deps.mfa.consumeChallenge(tx, challenge.id, at);
    await deps.mfa.revokeChallenges(tx, account.id, at);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: account.id,
      action: 'platform_account.mfa_enrolled', subjectType: 'platform_account', subjectId: account.id,
      after: { method: 'totp' },
    }, tx);
    return Ok({ enrolled: true as const });
  });
}

/**
 * AD-63 break-glass. For the sole Owner who lost their authenticator, run by
 * an operator. It only clears the authenticator: the account must enrol again
 * at its next sign-in, so no MFA-off state exists. Refused when any other
 * enrolled Owner can reset it in the console instead.
 */
export async function breakGlassResetPlatformMfa(
  deps: PlatformMfaDeps,
  input: { email: string; reason: string; operator: string },
): Promise<Result<{ accountId: string }>> {
  const reason = input.reason.trim();
  if (reason.length < 10) return Err(fail('VALIDATION_FAILED', 'Give a reason of at least ten characters.'));
  const at = deps.clock.now();
  return deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    const account = await deps.mfa.stateByEmail(tx, input.email.trim().toLowerCase());
    if (!account) return Err(fail('NOT_FOUND', 'No platform account has that email.'));
    const role = await deps.platformAdmin.activeAssignment(tx, account.id);
    if (role?.role !== 'owner' || account.status !== 'active') {
      return Err(fail('CONFLICT', 'Break-glass is only for an active Owner. Other accounts are reset by an Owner in the console.'));
    }
    if ((await deps.platformAdmin.countEnrolledOwners(tx, account.id)) > 0) {
      return Err(fail('CONFLICT', 'Another Owner with an authenticator exists. They must reset this account in the console.'));
    }
    if (!account.totpSealed && !account.pendingSealed) {
      return Err(fail('CONFLICT', 'This account has no authenticator to reset. It enrols at its next sign-in.'));
    }
    await deps.mfa.resetTotp(tx, account.id);
    await deps.mfa.revokeChallenges(tx, account.id, at);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'system', actorId: null,
      action: 'platform_account.mfa_break_glass_reset', subjectType: 'platform_account', subjectId: account.id,
      reason: `${reason} (operator: ${input.operator})`,
    }, tx);
    return Ok({ accountId: account.id });
  });
}

/** The command line's guard against accidents. */
export function parseBreakGlassArgs(argv: string[]): { email: string; reason: string; operator: string } | { error: string } {
  const value = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1]?.trim() ?? '' : '';
  };
  const email = value('email').toLowerCase();
  const reason = value('reason');
  const operator = value('operator');
  const confirm = value('confirm');
  if (!email || !reason || !operator) {
    return { error: 'Usage: --email <owner email> --reason "<why>" --operator "<your name>" --confirm "RESET <owner email>"' };
  }
  if (confirm !== `RESET ${email}`) return { error: `Refusing: --confirm must be exactly "RESET ${email}".` };
  return { email, reason, operator };
}

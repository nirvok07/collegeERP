/**
 * W2 authenticate, for both platform actors and tenant users.
 *
 * BR-24: failures never reveal whether an identifier exists. Every branch that
 * could disclose existence returns the same failure, and the credential
 * comparison runs even when the account is absent so timing does not disclose it.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, PasswordHasher, TokenIssuer } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  AccountRepository,
  CredentialRepository,
  LoginAttemptRepository,
  PlatformAccountRepository,
  RefreshTokenRepository,
} from './ports.ts';
import {
  afterFailedAttempt,
  afterSuccessfulSignIn,
  evaluateSignIn,
  type AccountSecurityState,
} from '../domain/account-policy.ts';
import { createHash } from 'node:crypto';

const GENERIC_FAILURE = 'Those sign-in details are not correct.';

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SignedInActor {
  actorType: 'platform' | 'person';
  actorId: string;
  tenantId: string | null;
  accountId: string | null;
  fullName: string;
}

export interface AuthenticateDeps {
  uow: UnitOfWork;
  platformAccounts: PlatformAccountRepository;
  accounts: AccountRepository;
  credentials: CredentialRepository;
  refreshTokens: RefreshTokenRepository;
  loginAttempts: LoginAttemptRepository;
  audit: AuditWriter;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  clock: Clock;
  ids: IdGenerator;
  refreshTtlDays: number;
}

const hashIdentifier = (v: string) => createHash('sha256').update(v.toLowerCase()).digest('hex');

/** A hash of a value no credential matches, so absent accounts still cost a verify. */
const DUMMY_HASH = 'scrypt$1$0000000000000000000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

export async function authenticatePlatformUser(
  deps: AuthenticateDeps,
  input: { email: string; password: string; ipHash?: string | null },
): Promise<Result<{ actor: SignedInActor; tokens: AuthTokens }>> {
  const at = deps.clock.now();
  return deps.uow.run(null, async (tx) => {
    const account = await deps.platformAccounts.findByEmail(tx, input.email);

    if (!account) {
      await deps.hasher.verify(input.password, DUMMY_HASH).catch(() => false);
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(),
        tenantId: null,
        identifierHash: hashIdentifier(input.email),
        accountId: null,
        outcome: 'failure',
        failureReason: 'unknown_identifier',
        ipHash: input.ipHash ?? null,
      });
      return Err(fail('UNAUTHENTICATED', GENERIC_FAILURE));
    }

    const state: AccountSecurityState = {
      status: account.status === 'active' ? 'active' : 'suspended',
      failedAttempts: account.failedAttempts,
      lockedUntil: account.lockedUntil,
    };
    const decision = evaluateSignIn(state, at);
    if (decision.kind === 'locked') {
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(), tenantId: null, identifierHash: hashIdentifier(input.email),
        accountId: account.id, outcome: 'failure', failureReason: 'locked', ipHash: input.ipHash ?? null,
      });
      return Err(
        fail('ACCOUNT_LOCKED', `Too many attempts. Try again after ${decision.until.toISOString()}.`),
      );
    }
    if (decision.kind === 'not_active') {
      return Err(fail('ACCOUNT_NOT_ACTIVE', 'This account is not active. Contact your administrator.'));
    }

    const storedHash = (await deps.platformAccounts.findCredentialHash(tx, account.id)) ?? DUMMY_HASH;
    const valid = await deps.hasher.verify(input.password, storedHash);

    if (!valid) {
      const next = afterFailedAttempt(state, at);
      await deps.platformAccounts.updateSecurityState(tx, account.id, {
        failedAttempts: next.failedAttempts,
        lockedUntil: next.lockedUntil,
        status: next.status === 'locked' ? 'active' : account.status,
      });
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(), tenantId: null, identifierHash: hashIdentifier(input.email),
        accountId: account.id, outcome: 'failure', failureReason: 'bad_credential', ipHash: input.ipHash ?? null,
      });
      return Err(fail('UNAUTHENTICATED', GENERIC_FAILURE));
    }

    const cleared = afterSuccessfulSignIn(state);
    await deps.platformAccounts.updateSecurityState(tx, account.id, {
      failedAttempts: cleared.failedAttempts,
      lockedUntil: cleared.lockedUntil,
      status: account.status,
    });
    await deps.platformAccounts.recordSignIn(tx, account.id, at);
    await deps.loginAttempts.record(tx, {
      id: deps.ids.next(), tenantId: null, identifierHash: hashIdentifier(input.email),
      accountId: account.id, outcome: 'success', failureReason: null, ipHash: input.ipHash ?? null,
    });

    const tokens = await issueTokens(deps, tx, {
      sub: account.id, actorType: 'platform', tenantId: null, accountId: null,
    }, { platformAccountId: account.id, accountId: null, tenantId: null }, at);

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: account.id,
      action: 'auth.signed_in', subjectType: 'platform_account', subjectId: account.id,
      ipHash: input.ipHash ?? null,
    }, tx);

    return Ok({
      actor: {
        actorType: 'platform' as const, actorId: account.id, tenantId: null,
        accountId: null, fullName: account.fullName,
      },
      tokens,
    });
  });
}

export async function authenticateTenantUser(
  deps: AuthenticateDeps,
  input: { tenantId: string; identifier: string; password: string; ipHash?: string | null },
): Promise<Result<{ actor: SignedInActor; tokens: AuthTokens }>> {
  const at = deps.clock.now();
  return deps.uow.run(input.tenantId, async (tx) => {
    const account = await deps.accounts.findByLoginIdentifier(tx, input.identifier);

    if (!account) {
      await deps.hasher.verify(input.password, DUMMY_HASH).catch(() => false);
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(), tenantId: input.tenantId, identifierHash: hashIdentifier(input.identifier),
        accountId: null, outcome: 'failure', failureReason: 'unknown_identifier', ipHash: input.ipHash ?? null,
      });
      return Err(fail('UNAUTHENTICATED', GENERIC_FAILURE));
    }

    const state: AccountSecurityState = {
      status: account.status,
      failedAttempts: account.failedAttempts,
      lockedUntil: account.lockedUntil,
    };
    const decision = evaluateSignIn(state, at);
    if (decision.kind === 'locked') {
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(), tenantId: input.tenantId, identifierHash: hashIdentifier(input.identifier),
        accountId: account.id, outcome: 'failure', failureReason: 'locked', ipHash: input.ipHash ?? null,
      });
      return Err(fail('ACCOUNT_LOCKED', 'Too many attempts. Try again shortly, or reset your password.'));
    }
    if (decision.kind === 'not_active') {
      const message =
        account.status === 'invited'
          ? 'Finish setting up your account using the invitation you were sent.'
          : 'This account is not active. Contact your administrator.';
      return Err(fail('ACCOUNT_NOT_ACTIVE', message));
    }

    const storedHash = (await deps.credentials.findHash(tx, account.id)) ?? DUMMY_HASH;
    const valid = await deps.hasher.verify(input.password, storedHash);

    if (!valid) {
      const next = afterFailedAttempt(state, at);
      await deps.accounts.updateSecurityState(tx, account.id, next);
      await deps.loginAttempts.record(tx, {
        id: deps.ids.next(), tenantId: input.tenantId, identifierHash: hashIdentifier(input.identifier),
        accountId: account.id, outcome: 'failure', failureReason: 'bad_credential', ipHash: input.ipHash ?? null,
      });
      return Err(fail('UNAUTHENTICATED', GENERIC_FAILURE));
    }

    await deps.accounts.updateSecurityState(tx, account.id, afterSuccessfulSignIn(state));
    await deps.accounts.recordSignIn(tx, account.id, at);
    await deps.loginAttempts.record(tx, {
      id: deps.ids.next(), tenantId: input.tenantId, identifierHash: hashIdentifier(input.identifier),
      accountId: account.id, outcome: 'success', failureReason: null, ipHash: input.ipHash ?? null,
    });

    const tokens = await issueTokens(deps, tx, {
      sub: account.personId, actorType: 'person', tenantId: input.tenantId, accountId: account.id,
    }, { platformAccountId: null, accountId: account.id, tenantId: input.tenantId }, at);

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: input.tenantId, actorType: 'person',
      actorId: account.personId, action: 'auth.signed_in', subjectType: 'user_account',
      subjectId: account.id, ipHash: input.ipHash ?? null,
    }, tx);

    return Ok({
      actor: {
        actorType: 'person' as const, actorId: account.personId, tenantId: input.tenantId,
        accountId: account.id, fullName: account.loginIdentifier,
      },
      tokens,
    });
  });
}

async function issueTokens(
  deps: AuthenticateDeps,
  tx: Parameters<Parameters<UnitOfWork['run']>[1]>[0],
  claims: { sub: string; actorType: 'platform' | 'person'; tenantId: string | null; accountId: string | null },
  owner: { platformAccountId: string | null; accountId: string | null; tenantId: string | null },
  at: Date,
): Promise<AuthTokens> {
  const access = deps.tokens.issueAccessToken(claims);
  const refresh = deps.tokens.issueOpaqueToken();
  const refreshExpiresAt = new Date(at.getTime() + deps.refreshTtlDays * 86_400_000);
  const tokenId = deps.ids.next();
  await deps.refreshTokens.issue(tx, {
    id: tokenId,
    // A fresh sign-in starts a new family. Every rotation that follows keeps it,
    // so the whole chain can be revoked together if a token is ever replayed.
    familyId: tokenId,
    tenantId: owner.tenantId,
    accountId: owner.accountId,
    platformAccountId: owner.platformAccountId,
    tokenHash: refresh.hash,
    expiresAt: refreshExpiresAt,
  });
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refreshExpiresAt,
  };
}

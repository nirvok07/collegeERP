/**
 * Session renewal. The mechanism that keeps a user signed in.
 *
 * Access-token lifetime and session lifetime are separate concerns. The access
 * token is short because it travels on every request and cannot be revoked
 * mid-life. The session is long because the user is still working, and it is
 * extended on every rotation rather than counted down from sign-in.
 *
 * Rotation with reuse detection, per docs/05-api-contract.md 5.3:
 *   - exchanging a token consumes it and issues a successor in the same family
 *   - presenting an already-consumed token means replay or theft, so the entire
 *     family is revoked and the user must sign in again
 *
 * Failures are separated deliberately. A token that is revoked, expired or
 * replayed ends the session. Anything else (the database is unreachable, the
 * network dropped) is a transient failure that must NOT end it: the caller
 * retries instead of signing the user out.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail, type Failure } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  AccountRepository, PlatformAccountRepository, RefreshTokenRepository,
} from './ports.ts';
import type { AuthTokens, SignedInActor } from './authenticate.ts';

export interface RefreshSessionDeps {
  uow: UnitOfWork;
  refreshTokens: RefreshTokenRepository;
  accounts: AccountRepository;
  platformAccounts: PlatformAccountRepository;
  audit: AuditWriter;
  tokens: TokenIssuer;
  clock: Clock;
  ids: IdGenerator;
  refreshTtlDays: number;
  /** AD-60: whether the account's college may be used. The rule lives in the institution domain. */
  tenantAccess: { denialFor(tenantId: string): Promise<Failure | null> };
}

const ENDED = 'Your session has ended. Please sign in again.';

export async function refreshSession(
  deps: RefreshSessionDeps,
  input: { refreshToken: string; ipHash?: string | null },
): Promise<Result<{ actor: SignedInActor; tokens: AuthTokens }>> {
  const at = deps.clock.now();
  const presentedHash = deps.tokens.hashOpaqueToken(input.refreshToken);

  // Resolution happens in platform scope: the tenant is not known until the row
  // is found. The lookup is a narrow SECURITY DEFINER function taking a 256-bit
  // hash, so it cannot enumerate anything.
  const found = await deps.uow.run(null, (tx) => deps.refreshTokens.resolve(tx, presentedHash));

  if (!found) return Err(fail('UNAUTHENTICATED', ENDED));

  if (found.consumedAt) {
    // Reuse. The legitimate holder already exchanged this token, so whoever
    // presented it now is replaying. Revoke everything in the family.
    await deps.uow.run(found.tenantId, async (tx) => {
      await deps.refreshTokens.revokeFamily(tx, found.familyId, 'refresh_token_reuse_detected');
      await deps.audit.record(
        {
          correlationId: deps.ids.next(),
          tenantId: found.tenantId,
          actorType: 'system',
          actorId: found.accountId ?? found.platformAccountId,
          action: 'auth.refresh_token_reuse_detected',
          subjectType: 'refresh_token_family',
          subjectId: found.familyId,
          reason: 'A consumed refresh token was presented again',
          ipHash: input.ipHash ?? null,
        },
        tx,
      );
    });
    return Err(fail('UNAUTHENTICATED', ENDED));
  }

  if (found.revokedAt) return Err(fail('UNAUTHENTICATED', ENDED));
  if (found.expiresAt.getTime() <= at.getTime()) return Err(fail('UNAUTHENTICATED', ENDED));
  // A suspended college's session is not renewed, so it cannot outlive its
  // access token (AD-60). Platform sessions carry no college.
  if (found.accountId && found.tenantId) {
    const denial = await deps.tenantAccess.denialFor(found.tenantId);
    if (denial) return Err(denial);
  }

  return deps.uow.run(found.tenantId, async (tx) => {
    let actor: SignedInActor;

    if (found.platformAccountId) {
      const account = await deps.platformAccounts.findById(tx, found.platformAccountId);
      // AD-82 supersedes AD-62: a platform session rests on the account being
      // active, as a college session does. A code is how it was opened.
      if (!account || account.status !== 'active') return Err(fail('UNAUTHENTICATED', ENDED));
      actor = {
        actorType: 'platform', actorId: account.id, tenantId: null,
        accountId: null, fullName: account.fullName,
      };
    } else if (found.accountId) {
      const account = await deps.accounts.findById(tx, found.accountId);
      // An account suspended or deactivated since sign-in cannot renew. This is
      // how a revocation reaches an already-signed-in user.
      if (!account || account.status !== 'active') return Err(fail('UNAUTHENTICATED', ENDED));
      actor = {
        actorType: 'person', actorId: account.personId, tenantId: account.tenantId,
        accountId: account.id, fullName: account.loginIdentifier,
      };
    } else {
      return Err(fail('UNAUTHENTICATED', ENDED));
    }

    const successorId = deps.ids.next();
    const successor = deps.tokens.issueOpaqueToken();
    // Sliding expiry: the window is measured from now, not from sign-in, so a
    // user who keeps working is never asked to sign in again.
    const expiresAt = new Date(at.getTime() + deps.refreshTtlDays * 86_400_000);

    await deps.refreshTokens.issue(tx, {
      id: successorId,
      familyId: found.familyId,
      tenantId: found.tenantId,
      accountId: found.accountId,
      platformAccountId: found.platformAccountId,
      tokenHash: successor.hash,
      expiresAt,
    });
    await deps.refreshTokens.consume(tx, found.id, successorId, at);

    const access = deps.tokens.issueAccessToken({
      sub: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      accountId: actor.accountId,
    });

    return Ok({
      actor,
      tokens: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: successor.token,
        refreshTokenExpiresAt: expiresAt,
      },
    });
  });
}

/** Explicit sign-out. Ends the whole family, not just the presented token. */
export async function endSession(
  deps: RefreshSessionDeps,
  input: { refreshToken: string },
): Promise<Result<{
  ended: boolean;
  /** The college account the session belonged to, so its devices can be revoked. */
  account: { tenantId: string; accountId: string; personId: string } | null;
}>> {
  const presentedHash = deps.tokens.hashOpaqueToken(input.refreshToken);
  const found = await deps.uow.run(null, (tx) => deps.refreshTokens.resolve(tx, presentedHash));
  // Signing out an unknown token still succeeds: the caller wanted to be signed
  // out, and saying "no such session" would leak whether one existed.
  if (!found) return Ok({ ended: true, account: null });

  const account = await deps.uow.run(found.tenantId, async (tx) => {
    await deps.refreshTokens.revokeFamily(tx, found.familyId, 'signed_out');
    await deps.audit.record(
      {
        correlationId: deps.ids.next(),
        tenantId: found.tenantId,
        actorType: found.platformAccountId ? 'platform' : 'person',
        actorId: found.platformAccountId ?? found.accountId,
        action: 'auth.signed_out',
        subjectType: 'refresh_token_family',
        subjectId: found.familyId,
      },
      tx,
    );
    if (!found.accountId || !found.tenantId) return null;
    const owner = await deps.accounts.findById(tx, found.accountId);
    return owner ? { tenantId: found.tenantId, accountId: found.accountId, personId: owner.personId } : null;
  });
  return Ok({ ended: true, account });
}

/**
 * W1 activation. The invited person sets a credential and the account becomes active.
 * Tokens are single use; consuming one invalidates it even if the request later fails.
 *
 * AD-80: the same token redeems a password reset. For an account that is
 * already in use, the password is replaced, a lock from failed sign-ins is
 * lifted, and every session of the account ends.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, PasswordHasher, TokenIssuer } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { AccountRepository, CredentialRepository, InvitationRepository, RefreshTokenRepository } from './ports.ts';
import { validatePassword } from '../domain/account-policy.ts';

export interface AcceptInvitationDeps {
  uow: UnitOfWork;
  invitations: InvitationRepository;
  accounts: AccountRepository;
  credentials: CredentialRepository;
  refreshTokens: RefreshTokenRepository;
  audit: AuditWriter;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  clock: Clock;
  ids: IdGenerator;
}

/** A code never reopens an account someone deliberately shut. */
const REDEEMABLE = new Set(['invited', 'active', 'locked']);

export async function acceptInvitation(
  deps: AcceptInvitationDeps,
  input: { tenantId: string; token: string; password: string },
): Promise<Result<{ accountId: string; reset: boolean }>> {
  const problem = validatePassword(input.password);
  if (problem) {
    return Err(fail('VALIDATION_FAILED', problem, { fieldErrors: { password: problem } }));
  }

  const at = deps.clock.now();
  return deps.uow.run(input.tenantId, async (tx) => {
    const hash = deps.tokens.hashOpaqueToken(input.token);
    const invitation = await deps.invitations.findValidByHash(tx, hash, at);
    if (!invitation) {
      // One message for absent, consumed and expired alike: a distinguishing
      // message would let an attacker probe which tokens once existed.
      return Err(fail('UNAUTHENTICATED', 'This code is no longer valid. Ask for a new one.'));
    }

    const account = await deps.accounts.findById(tx, invitation.accountId);
    if (!account || !REDEEMABLE.has(account.status)) {
      return Err(fail('UNAUTHENTICATED', 'This code is no longer valid. Ask for a new one.'));
    }
    const reset = account.status !== 'invited';

    await deps.credentials.set(tx, account.id, account.tenantId, await deps.hasher.hash(input.password));
    await deps.invitations.consume(tx, invitation.id, at);
    if (reset) {
      await deps.accounts.updateSecurityState(tx, account.id, { failedAttempts: 0, lockedUntil: null, status: 'active' });
      await deps.refreshTokens.revokeAllForAccount(tx, account.id, at);
    } else {
      await deps.accounts.markActivated(tx, account.id, at);
    }

    await deps.audit.record({
      correlationId: deps.ids.next(),
      tenantId: account.tenantId,
      actorType: 'person',
      actorId: account.personId,
      action: reset ? 'account.password_reset' : 'account.activated',
      subjectType: 'user_account',
      subjectId: account.id,
      before: { status: account.status },
      after: reset ? { status: 'active', signed_out: true } : { status: 'active' },
    }, tx);

    return Ok({ accountId: account.id, reset });
  });
}

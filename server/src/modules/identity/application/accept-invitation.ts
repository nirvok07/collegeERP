/**
 * W1 activation. The invited person sets a credential and the account becomes active.
 * Tokens are single use; consuming one invalidates it even if the request later fails.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, PasswordHasher, TokenIssuer } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { AccountRepository, CredentialRepository, InvitationRepository } from './ports.ts';
import { validatePassword } from '../domain/account-policy.ts';

export interface AcceptInvitationDeps {
  uow: UnitOfWork;
  invitations: InvitationRepository;
  accounts: AccountRepository;
  credentials: CredentialRepository;
  audit: AuditWriter;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  clock: Clock;
  ids: IdGenerator;
}

export async function acceptInvitation(
  deps: AcceptInvitationDeps,
  input: { tenantId: string; token: string; password: string },
): Promise<Result<{ accountId: string }>> {
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
      return Err(fail('UNAUTHENTICATED', 'This invitation link is no longer valid. Ask for a new one.'));
    }

    const account = await deps.accounts.findById(tx, invitation.accountId);
    if (!account) return Err(fail('NOT_FOUND', 'This invitation link is no longer valid. Ask for a new one.'));

    await deps.credentials.set(tx, account.id, account.tenantId, await deps.hasher.hash(input.password));
    await deps.invitations.consume(tx, invitation.id, at);
    await deps.accounts.markActivated(tx, account.id, at);

    await deps.audit.record({
      correlationId: deps.ids.next(),
      tenantId: account.tenantId,
      actorType: 'person',
      actorId: account.personId,
      action: 'account.activated',
      subjectType: 'user_account',
      subjectId: account.id,
      before: { status: account.status },
      after: { status: 'active' },
    }, tx);

    return Ok({ accountId: account.id });
  });
}

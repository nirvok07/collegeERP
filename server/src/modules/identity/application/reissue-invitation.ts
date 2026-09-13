/**
 * W0 "Correction": reissue the first administrator's invitation.
 *
 * M1's capability, called by the platform's college lifecycle inside a
 * transaction scoped to that college, exactly as provisioning calls
 * provisionInitialAdmin. Every unused invitation of the account is revoked in
 * the same transaction, so at most one link works at a time, and the new token
 * is returned once and stored only as a hash.
 */
import type { Tx } from '../../../shared/application/unit-of-work.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { AccountRepository, BootstrapAdministrator, InvitationRepository } from './ports.ts';
import { AppException } from '../../../core/errors.ts';

export interface ReissueInvitationDeps {
  accounts: AccountRepository;
  invitations: InvitationRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  tokens: TokenIssuer;
  invitationTtlHours: number;
}

export async function reissueAdministratorInvitation(
  deps: ReissueInvitationDeps,
  tx: Tx,
  input: { tenantId: string; platformAccountId: string; correlationId: string },
): Promise<{ administrator: BootstrapAdministrator; token: string; expiresAt: Date; revoked: number }> {
  if (tx.tenantId !== input.tenantId) {
    throw new AppException('FORBIDDEN', 'Transaction tenant does not match the college');
  }
  const administrator = await deps.accounts.findBootstrapAdministrator(tx);
  if (!administrator) throw new AppException('NOT_FOUND', 'This college has no initial administrator.');
  if (administrator.accountStatus !== 'invited') {
    throw new AppException(
      'CONFLICT',
      'The administrator has already accepted their invitation. They sign in with their own password.',
    );
  }

  const now = deps.clock.now();
  const revoked = await deps.invitations.revokeOutstanding(tx, administrator.accountId, now);
  const { token, hash } = deps.tokens.issueOpaqueToken();
  const expiresAt = new Date(now.getTime() + deps.invitationTtlHours * 3_600_000);
  const invitationId = deps.ids.next();
  await deps.invitations.issue(tx, {
    id: invitationId,
    tenantId: input.tenantId,
    accountId: administrator.accountId,
    tokenHash: hash,
    expiresAt,
  });

  await deps.audit.record({
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    actorType: 'platform',
    actorId: input.platformAccountId,
    action: 'invitation.reissued',
    subjectType: 'user_account',
    subjectId: administrator.accountId,
    // Never the token or its hash: only that a new one exists and until when.
    after: { invitation_id: invitationId, expires_at: expiresAt.toISOString(), revoked_previous: revoked },
  }, tx);

  return { administrator, token, expiresAt, revoked };
}

/**
 * ADM-1: a person changes their own password.
 *
 * The current password must be given, the new one meets the policy, and every
 * session of the account then ends, this device's included: the person signs
 * in again with the new password. Nobody else, an administrator included, can
 * set another person's password; that stays the invitation's job.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { CredentialRepository, RefreshTokenRepository } from './ports.ts';
import { validatePassword } from '../domain/account-policy.ts';

export interface ChangePasswordDeps {
  uow: UnitOfWork;
  credentials: CredentialRepository;
  refreshTokens: RefreshTokenRepository;
  hasher: {
    hash(plaintext: string): Promise<string>;
    verify(plaintext: string, hash: string): Promise<boolean>;
  };
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

export async function changePassword(
  deps: ChangePasswordDeps,
  input: {
    tenantId: string;
    accountId: string;
    personId: string;
    currentPassword: string;
    newPassword: string;
  },
): Promise<Result<{ signedOut: true }>> {
  const problem = validatePassword(input.newPassword);
  if (problem) {
    return Err(fail('VALIDATION_FAILED', problem, { fieldErrors: { new_password: problem } }));
  }
  if (input.newPassword === input.currentPassword) {
    return Err(fail('VALIDATION_FAILED', 'Choose a new password, not the current one.', {
      fieldErrors: { new_password: 'Same as the current password' },
    }));
  }
  const newHash = await deps.hasher.hash(input.newPassword);

  return deps.uow.run(input.tenantId, async (tx) => {
    const stored = await deps.credentials.findHash(tx, input.accountId);
    const valid = stored ? await deps.hasher.verify(input.currentPassword, stored).catch(() => false) : false;
    if (!valid) {
      return Err(fail('VALIDATION_FAILED', 'That is not your current password.', {
        fieldErrors: { current_password: 'Not your current password' },
      }));
    }
    await deps.credentials.set(tx, input.accountId, input.tenantId, newHash);
    // Every device signs in again, so a password someone else knew stops working everywhere.
    await deps.refreshTokens.revokeAllForAccount(tx, input.accountId, deps.clock.now());
    await deps.audit.record({
      correlationId: deps.ids.next(),
      tenantId: input.tenantId,
      actorType: 'person',
      actorId: input.personId,
      action: 'account.password_changed',
      subjectType: 'account',
      subjectId: input.accountId,
      reason: 'Changed by the account holder',
    }, tx);
    return Ok({ signedOut: true as const });
  });
}

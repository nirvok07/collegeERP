/**
 * AD-80 (OD-PW-1, R69): getting back in after a forgotten password, without email.
 *
 * Someone who may manage accounts issues a one-time reset code, handed over the
 * way an invitation is (AD-75); the person redeems it with a password only they
 * know, through the same single-use token machinery as an invitation. Nothing
 * changes until the code is redeemed: the old password keeps working, so issuing
 * a code cannot lock anybody out. Redeeming ends every session of the account.
 *
 * An account still waiting on its invitation gets a fresh invitation instead,
 * which is the same thing to the person holding it.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { AccountRecord, AccountRepository, InvitationRepository, RoleAssignmentRepository } from './ports.ts';
import { COLLEGE_ADMIN_ROLE_KEY } from './provision-initial-admin.ts';

/** A reset code is shorter-lived than an invitation: it is for someone who is waiting for it. */
export const RESET_TTL_HOURS = 24;

/** Statuses a code can bring back. Suspended, deactivated and archived accounts stay shut. */
const RESETTABLE = new Set(['invited', 'active', 'locked']);

export interface PasswordResetDeps {
  accounts: AccountRepository;
  invitations: InvitationRepository;
  assignments: RoleAssignmentRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  tokens: TokenIssuer;
  invitationTtlHours: number;
}

export interface IssuedReset {
  kind: 'reset' | 'invitation';
  token: string;
  expiresAt: Date;
  accountId: string;
}

const isAdministrator = async (deps: PasswordResetDeps, tx: Tx, personId: string) =>
  (await deps.assignments.listActiveForPerson(tx, personId)).some((a) => a.roleKey === COLLEGE_ADMIN_ROLE_KEY);

async function issueFor(
  deps: PasswordResetDeps,
  tx: Tx,
  account: AccountRecord,
  by: { actorType: 'person' | 'platform'; actorId: string; correlationId: string },
): Promise<IssuedReset> {
  const now = deps.clock.now();
  const kind = account.status === 'invited' ? 'invitation' : 'reset';
  const ttlHours = kind === 'invitation' ? deps.invitationTtlHours : RESET_TTL_HOURS;
  // At most one code works at a time.
  const revoked = await deps.invitations.revokeOutstanding(tx, account.id, now);
  const { token, hash } = deps.tokens.issueOpaqueToken();
  const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
  const id = deps.ids.next();
  await deps.invitations.issue(tx, { id, tenantId: account.tenantId, accountId: account.id, tokenHash: hash, expiresAt });
  await deps.audit.record({
    correlationId: by.correlationId,
    tenantId: account.tenantId,
    actorType: by.actorType,
    actorId: by.actorId,
    action: kind === 'reset' ? 'account.password_reset_issued' : 'invitation.reissued',
    subjectType: 'user_account',
    subjectId: account.id,
    // Never the code or its hash: only that one exists and until when.
    after: { invitation_id: id, expires_at: expiresAt.toISOString(), revoked_previous: revoked },
  }, tx);
  return { kind, token, expiresAt, accountId: account.id };
}

/**
 * Inside the college: someone with `account.manage` (checked by the route)
 * issues a code for another person's account.
 */
export async function issuePasswordReset(
  deps: PasswordResetDeps & { uow: UnitOfWork },
  actor: { tenantId: string; personId: string },
  input: { personId: string },
): Promise<Result<IssuedReset>> {
  if (input.personId === actor.personId) {
    return Err(fail('FORBIDDEN', 'To change your own password, use Change password in your Profile.'));
  }
  return deps.uow.run(actor.tenantId, async (tx) => {
    const account = await deps.accounts.findByPersonId(tx, input.personId);
    if (!account) return Err(fail('NOT_FOUND', 'This person has no account to reset.'));
    if (!RESETTABLE.has(account.status)) {
      return Err(fail('CONFLICT', `This account is ${account.status}, so it cannot be reset.`));
    }
    // Whoever holds the code can set the password, so a code for an
    // administrator is only for another administrator to issue.
    if ((await isAdministrator(deps, tx, input.personId)) && !(await isAdministrator(deps, tx, actor.personId))) {
      return Err(fail('FORBIDDEN', 'Only another administrator can reset an administrator’s password.'));
    }
    return Ok(await issueFor(deps, tx, account, {
      actorType: 'person', actorId: actor.personId, correlationId: deps.ids.next(),
    }));
  });
}

/**
 * From the platform, for a college's administrator only, named by their sign-in
 * email. Called by the college lifecycle inside a transaction scoped to that
 * college, as the invitation reissue is.
 */
export async function issueAdministratorReset(
  deps: PasswordResetDeps,
  tx: Tx,
  input: { email: string; platformAccountId: string; correlationId: string },
): Promise<IssuedReset> {
  const account = await deps.accounts.findByLoginIdentifier(tx, input.email.trim().toLowerCase());
  // One answer for "no such account" and "not an administrator": the platform
  // resets administrators, not anybody whose email it can guess.
  if (!account || !(await isAdministrator(deps, tx, account.personId))) {
    throw new AppException('NOT_FOUND', 'No administrator of this college signs in with that email.');
  }
  if (!RESETTABLE.has(account.status)) {
    throw new AppException('CONFLICT', `That administrator's account is ${account.status}, so it cannot be reset.`);
  }
  return issueFor(deps, tx, account, {
    actorType: 'platform', actorId: input.platformAccountId, correlationId: input.correlationId,
  });
}

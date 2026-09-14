/**
 * SA-3a: platform accounts managed by the application, not by SQL.
 *
 * Every change takes one platform-wide lock and re-reads the acting account's
 * own authority inside it, so two Owners demoting or disabling each other at
 * once cannot leave the platform without a usable Owner. Nobody may change
 * their own account: another Owner must.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { PlatformMfaRepository } from './platform-mfa.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import {
  isPlatformRole, platformPermissions, type PlatformPermission, type PlatformRole,
} from '../domain/platform-authority.ts';

export type PlatformAccountStatus = 'invited' | 'active' | 'suspended' | 'deactivated';
export type AccountAction = 'disable' | 'enable' | 'change_role' | 'reset_mfa' | 'reissue_invitation';

export interface PlatformAccountSummary {
  id: string;
  email: string;
  fullName: string;
  status: PlatformAccountStatus;
  role: PlatformRole | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  mfaEnrolled: boolean;
}

export interface RoleHistoryEntry {
  role: PlatformRole;
  grantedAt: Date;
  endedAt: Date | null;
  reason: string | null;
}

export interface PlatformAdminRepository {
  list(tx: Tx): Promise<PlatformAccountSummary[]>;
  find(tx: Tx, id: string): Promise<PlatformAccountSummary | null>;
  emailTaken(tx: Tx, email: string): Promise<boolean>;
  history(tx: Tx, id: string): Promise<RoleHistoryEntry[]>;
  create(tx: Tx, input: { id: string; email: string; fullName: string }): Promise<void>;
  setStatus(tx: Tx, id: string, status: PlatformAccountStatus): Promise<void>;
  activeAssignment(tx: Tx, accountId: string): Promise<{ id: string; role: PlatformRole } | null>;
  grant(tx: Tx, input: { id: string; accountId: string; role: PlatformRole; grantedBy: string | null; reason: string }): Promise<void>;
  end(tx: Tx, assignmentId: string, by: string, at: Date): Promise<void>;
  lockOwnership(tx: Tx): Promise<void>;
  countUsableOwners(tx: Tx): Promise<number>;
  countEnrolledOwners(tx: Tx, excludingId: string): Promise<number>;
  authorityOf(tx: Tx, id: string): Promise<{ status: PlatformAccountStatus; role: PlatformRole | null; mfaEnrolled: boolean } | null>;
}

/** Status and role of a platform account, read live per request (AD-16). */
export interface PlatformAuthorityReader {
  forAccount(id: string): Promise<{ status: PlatformAccountStatus; role: PlatformRole | null; mfaEnrolled: boolean } | null>;
}

export interface ManagePlatformAccountsDeps {
  uow: UnitOfWork;
  platformAdmin: PlatformAdminRepository;
  mfa: PlatformMfaRepository;
  tokens: TokenIssuer;
  invitationTtlHours: number;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

export interface Viewer {
  id: string;
  permissions: Set<PlatformPermission>;
}

export interface PlatformAccountView {
  account: PlatformAccountSummary;
  history: RoleHistoryEntry[];
  actions: AccountAction[];
  isYou: boolean;
}

const SELF = 'You cannot change your own account. Ask another Owner.';
const LAST_OWNER = 'This is the only active Owner. Make another account an Owner first.';

export async function listPlatformAccounts(deps: ManagePlatformAccountsDeps): Promise<PlatformAccountSummary[]> {
  return deps.uow.run(null, (tx) => deps.platformAdmin.list(tx));
}

export async function getPlatformAccount(
  deps: ManagePlatformAccountsDeps, viewer: Viewer, id: string,
): Promise<Result<PlatformAccountView>> {
  return deps.uow.run(null, async (tx) => {
    const view = await viewOf(deps, tx, id, viewer);
    return view ? Ok(view) : Err(fail('NOT_FOUND', 'That platform account was not found.'));
  });
}

async function viewOf(
  deps: ManagePlatformAccountsDeps, tx: Tx, id: string, viewer: Viewer,
): Promise<PlatformAccountView | null> {
  const account = await deps.platformAdmin.find(tx, id);
  if (!account) return null;
  const isYou = account.id === viewer.id;
  const actions: AccountAction[] = [];
  if (!isYou) {
    const onlyOwner = account.role === 'owner' && account.status === 'active'
      && (await deps.platformAdmin.countUsableOwners(tx)) <= 1;
    if (viewer.permissions.has('platform.accounts.manage') && !onlyOwner) {
      if (account.status === 'active') actions.push('disable');
      if (account.status === 'suspended') actions.push('enable');
    }
    if (viewer.permissions.has('platform.roles.manage') && !onlyOwner) actions.push('change_role');
    if (viewer.permissions.has('platform.accounts.manage')) {
      if (account.mfaEnrolled) actions.push('reset_mfa');
      if (account.status === 'invited') actions.push('reissue_invitation');
    }
  }
  return { account, history: await deps.platformAdmin.history(tx, id), actions, isYou };
}

/** Inside the lock: the actor's own authority as it stands now, not at request start. */
async function requireStillAllowed(
  deps: ManagePlatformAccountsDeps, tx: Tx, actorId: string, permission: PlatformPermission,
): Promise<Result<true>> {
  const authority = await deps.platformAdmin.authorityOf(tx, actorId);
  // AD-82 supersedes AD-62: the account is active and its role allows it.
  if (!authority || authority.status !== 'active' || !platformPermissions(authority.role).has(permission)) {
    return Err(fail('FORBIDDEN', 'Your platform role does not allow this.'));
  }
  return Ok(true);
}

const reasonProblem = (reason: string) =>
  reason.trim().length < 3
    ? fail('VALIDATION_FAILED', 'Say why, in a few words.', { fieldErrors: { reason: 'Required' } })
    : null;

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export interface IssuedInvitation {
  token: string;
  expiresAt: Date;
}

/** The invitation is the only way into a new account; its token is returned once. */
async function issuePlatformInvitation(
  deps: ManagePlatformAccountsDeps, tx: Tx, accountId: string, by: string, reissued: boolean,
): Promise<IssuedInvitation> {
  const at = deps.clock.now();
  const revoked = await deps.mfa.revokeInvitations(tx, accountId, at);
  const { token, hash } = deps.tokens.issueOpaqueToken();
  const expiresAt = new Date(at.getTime() + deps.invitationTtlHours * 3_600_000);
  await deps.mfa.issueInvitation(tx, { id: deps.ids.next(), accountId, tokenHash: hash, expiresAt });
  await deps.audit.record({
    correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: by,
    action: 'platform_account.invitation_issued', subjectType: 'platform_account', subjectId: accountId,
    after: { expires_at: expiresAt.toISOString(), reissued, revoked_previous: revoked },
  }, tx);
  return { token, expiresAt };
}

export async function createPlatformAccount(
  deps: ManagePlatformAccountsDeps,
  viewer: Viewer,
  input: { email: string; fullName: string; role: string },
): Promise<Result<{ view: PlatformAccountView; invitation: IssuedInvitation }>> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const fieldErrors: Record<string, string> = {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fieldErrors.email = 'Enter a valid email address';
  if (fullName.length < 2) fieldErrors.full_name = 'Enter the person’s name';
  if (!isPlatformRole(input.role)) fieldErrors.role = 'Choose Owner or Support';
  if (Object.keys(fieldErrors).length) {
    return Err(fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors }));
  }
  const role = input.role as PlatformRole;

  return guarded(() => deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    const allowed = await requireStillAllowed(deps, tx, viewer.id, 'platform.accounts.manage');
    if (!allowed.ok) return allowed;
    if (await deps.platformAdmin.emailTaken(tx, email)) {
      return Err(fail('CONFLICT', 'A platform account with that email already exists.', {
        fieldErrors: { email: 'Already in use' },
      }));
    }
    const id = deps.ids.next();
    await deps.platformAdmin.create(tx, { id, email, fullName });
    await deps.platformAdmin.grant(tx, {
      id: deps.ids.next(), accountId: id, role, grantedBy: viewer.id, reason: 'Account created',
    });
    const correlationId = deps.ids.next();
    await deps.audit.record({
      correlationId, tenantId: null, actorType: 'platform', actorId: viewer.id,
      action: 'platform_account.created', subjectType: 'platform_account', subjectId: id,
      after: { email, full_name: fullName, status: 'invited' },
    }, tx);
    await deps.audit.record({
      correlationId, tenantId: null, actorType: 'platform', actorId: viewer.id,
      action: 'platform_role.assigned', subjectType: 'platform_account', subjectId: id,
      after: { role },
    }, tx);
    const invitation = await issuePlatformInvitation(deps, tx, id, viewer.id, false);
    return Ok({ view: (await viewOf(deps, tx, id, viewer))!, invitation });
  }));
}

export async function reissuePlatformInvitation(
  deps: ManagePlatformAccountsDeps, viewer: Viewer, input: { id: string },
): Promise<Result<{ view: PlatformAccountView; invitation: IssuedInvitation }>> {
  return guarded(() => deps.uow.run(null, async (tx) => {
    const allowed = await requireStillAllowed(deps, tx, viewer.id, 'platform.accounts.manage');
    if (!allowed.ok) return allowed;
    const target = await deps.platformAdmin.find(tx, input.id);
    if (!target) return Err(fail('NOT_FOUND', 'That platform account was not found.'));
    if (target.status !== 'invited') {
      return Err(fail('CONFLICT', 'This account has already accepted its invitation.'));
    }
    const invitation = await issuePlatformInvitation(deps, tx, input.id, viewer.id, true);
    return Ok({ view: (await viewOf(deps, tx, input.id, viewer))!, invitation });
  }));
}

/**
 * Owner-mediated reset (AD-63). The authenticator is cleared, every live
 * challenge spent, and the account's sessions stop at their next request
 * because a platform session needs an enrolled authenticator. The account
 * enrols again at its next sign-in; nothing leaves MFA switched off.
 */
export async function resetPlatformMfa(
  deps: ManagePlatformAccountsDeps, viewer: Viewer, input: { id: string; reason: string },
): Promise<Result<PlatformAccountView>> {
  const problem = reasonProblem(input.reason);
  if (problem) return Err(problem);
  if (input.id === viewer.id) return Err(fail('CONFLICT', SELF));
  return guarded(() => deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    const allowed = await requireStillAllowed(deps, tx, viewer.id, 'platform.accounts.manage');
    if (!allowed.ok) return allowed;
    const target = await deps.mfa.state(tx, input.id);
    if (!target) return Err(fail('NOT_FOUND', 'That platform account was not found.'));
    if (!target.totpSealed && !target.pendingSealed) {
      return Err(fail('CONFLICT', 'This account has no authenticator to reset.'));
    }
    const at = deps.clock.now();
    await deps.mfa.resetTotp(tx, input.id);
    await deps.mfa.revokeChallenges(tx, input.id, at);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: viewer.id,
      action: 'platform_account.mfa_reset', subjectType: 'platform_account', subjectId: input.id,
      reason: input.reason.trim(),
    }, tx);
    return Ok((await viewOf(deps, tx, input.id, viewer))!);
  }));
}

export async function setPlatformAccountStatus(
  deps: ManagePlatformAccountsDeps,
  viewer: Viewer,
  input: { id: string; action: 'disable' | 'enable'; reason: string },
): Promise<Result<PlatformAccountView>> {
  const problem = reasonProblem(input.reason);
  if (problem) return Err(problem);
  if (input.id === viewer.id) return Err(fail('CONFLICT', SELF));

  return guarded(() => deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    const allowed = await requireStillAllowed(deps, tx, viewer.id, 'platform.accounts.manage');
    if (!allowed.ok) return allowed;
    const target = await deps.platformAdmin.find(tx, input.id);
    if (!target) return Err(fail('NOT_FOUND', 'That platform account was not found.'));
    if (target.status === 'invited') {
      return Err(fail('CONFLICT', 'This account has not finished enrolment, so there is nothing to enable or disable yet.'));
    }
    const to = input.action === 'disable'
      ? (target.status === 'active' ? 'suspended' : null)
      : (target.status === 'suspended' ? 'active' : null);
    if (!to) return Err(fail('CONFLICT', `This account is ${target.status === 'suspended' ? 'already disabled' : `already ${target.status}`}.`));
    if (input.action === 'disable' && target.role === 'owner'
        && (await deps.platformAdmin.countUsableOwners(tx)) <= 1) {
      return Err(fail('CONFLICT', LAST_OWNER));
    }
    await deps.platformAdmin.setStatus(tx, input.id, to);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: viewer.id,
      action: input.action === 'disable' ? 'platform_account.disabled' : 'platform_account.enabled',
      subjectType: 'platform_account', subjectId: input.id,
      before: { status: target.status }, after: { status: to }, reason: input.reason.trim(),
    }, tx);
    return Ok((await viewOf(deps, tx, input.id, viewer))!);
  }));
}

export async function changePlatformRole(
  deps: ManagePlatformAccountsDeps,
  viewer: Viewer,
  input: { id: string; role: string; expectedRole: string | null; reason: string },
): Promise<Result<PlatformAccountView>> {
  if (!isPlatformRole(input.role)) {
    return Err(fail('VALIDATION_FAILED', 'Choose Owner or Support.', { fieldErrors: { role: 'Invalid role' } }));
  }
  const problem = reasonProblem(input.reason);
  if (problem) return Err(problem);
  if (input.id === viewer.id) return Err(fail('CONFLICT', SELF));
  const role = input.role as PlatformRole;

  return guarded(() => deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    const allowed = await requireStillAllowed(deps, tx, viewer.id, 'platform.roles.manage');
    if (!allowed.ok) return allowed;
    const target = await deps.platformAdmin.find(tx, input.id);
    if (!target) return Err(fail('NOT_FOUND', 'That platform account was not found.'));
    const current = await deps.platformAdmin.activeAssignment(tx, input.id);
    if ((current?.role ?? null) !== (input.expectedRole ?? null)) {
      return Err(fail('CONFLICT', 'Somebody else changed this account’s role. Reload and try again.'));
    }
    if (current?.role === role) return Err(fail('CONFLICT', 'The account already has that role.'));
    if (current?.role === 'owner' && target.status === 'active'
        && (await deps.platformAdmin.countUsableOwners(tx)) <= 1) {
      return Err(fail('CONFLICT', LAST_OWNER));
    }
    const at = deps.clock.now();
    if (current) await deps.platformAdmin.end(tx, current.id, viewer.id, at);
    await deps.platformAdmin.grant(tx, {
      id: deps.ids.next(), accountId: input.id, role, grantedBy: viewer.id, reason: input.reason.trim(),
    });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: viewer.id,
      action: 'platform_role.changed', subjectType: 'platform_account', subjectId: input.id,
      before: { role: current?.role ?? null }, after: { role }, reason: input.reason.trim(),
    }, tx);
    return Ok((await viewOf(deps, tx, input.id, viewer))!);
  }));
}

/**
 * M1's public capability, called by M2 during tenant provisioning.
 *
 * AD-20 permits this to run inside M2's transaction. M2 passes the Tx; it does
 * not touch M1's tables. That is the whole point of the capability: the shared
 * transaction is permitted, the shared data access is not.
 *
 * BR-25: authorised by platform authority, so BR-2's in-tenant approval does not
 * apply. Without the exception the first administrator could never exist, since
 * their approver would have to be inside an empty tenant.
 *
 * BR-26: the assignment is ordinary. No flag, no primacy. Replacement, suspension
 * and additional administrators all use the normal paths (AD-21).
 */
import type { Tx } from '../../../shared/application/unit-of-work.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type {
  AccountRepository,
  InvitationRepository,
  PersonRepository,
  RoleAssignmentRepository,
  RoleDefinitionRepository,
} from './ports.ts';
import { AppException } from '../../../core/errors.ts';

export const COLLEGE_ADMIN_ROLE_KEY = 'college_admin';

export interface ProvisionInitialAdminInput {
  tenantId: string;
  fullName: string;
  email: string;
  phone: string | null;
  grantedByPlatformAccountId: string;
  correlationId: string;
}

export interface ProvisionInitialAdminOutput {
  personId: string;
  accountId: string;
  assignmentId: string;
  /** Returned once, never stored in plaintext. Delivered by the invitation notification. */
  invitationToken: string;
  invitationExpiresAt: Date;
}

export interface Deps {
  persons: PersonRepository;
  accounts: AccountRepository;
  assignments: RoleAssignmentRepository;
  roles: RoleDefinitionRepository;
  invitations: InvitationRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  tokens: TokenIssuer;
  invitationTtlHours: number;
}

export async function provisionInitialAdmin(
  deps: Deps,
  tx: Tx,
  input: ProvisionInitialAdminInput,
): Promise<ProvisionInitialAdminOutput> {
  if (tx.tenantId !== input.tenantId) {
    // A transaction can never span two tenants. This should be unreachable;
    // it exists so that a future refactor cannot make it reachable quietly.
    throw new AppException('FORBIDDEN', 'Transaction tenant does not match the provisioning target');
  }

  const role = await deps.roles.findByKey(tx, COLLEGE_ADMIN_ROLE_KEY);
  if (!role) {
    throw new AppException('UNKNOWN', `System role ${COLLEGE_ADMIN_ROLE_KEY} is missing`);
  }

  // BR-26 read as a guard: bootstrap applies only while the tenant has no administrator.
  const existing = await deps.assignments.countActiveByRoleKey(tx, COLLEGE_ADMIN_ROLE_KEY);
  if (existing > 0) {
    throw new AppException(
      'CONFLICT',
      'This institution already has an administrator. Use the ordinary role assignment path.',
    );
  }

  const now = deps.clock.now();

  const person = await deps.persons.create(tx, {
    id: deps.ids.next(),
    tenantId: input.tenantId,
    fullName: input.fullName,
    primaryEmail: input.email,
    primaryPhone: input.phone,
    personType: 'staff',
    status: 'provisional',
  });

  const account = await deps.accounts.create(tx, {
    id: deps.ids.next(),
    tenantId: input.tenantId,
    personId: person.id,
    loginIdentifier: input.email,
    status: 'invited',
    // BR-12: the role carries critical permissions, so a second factor is required.
    mfaRequired: true,
  });

  const assignment = await deps.assignments.create(tx, {
    id: deps.ids.next(),
    tenantId: input.tenantId,
    personId: person.id,
    roleId: role.id,
    scopeType: 'institution',
    scopeRefId: null,
    validFrom: now,
    validTo: null,
    source: 'bootstrap',
    grantedByPerson: null,
    grantedByPlatform: input.grantedByPlatformAccountId,
    reason: 'Initial administrator created during institution provisioning',
  });

  const { token, hash } = deps.tokens.issueOpaqueToken();
  const expiresAt = new Date(now.getTime() + deps.invitationTtlHours * 3_600_000);
  const invitationId = deps.ids.next();
  await deps.invitations.issue(tx, {
    id: invitationId,
    tenantId: input.tenantId,
    accountId: account.id,
    tokenHash: hash,
    expiresAt,
  });

  const base = {
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    actorType: 'platform' as const,
    actorId: input.grantedByPlatformAccountId,
  };
  await deps.audit.record({
    ...base,
    action: 'person.created',
    subjectType: 'person',
    subjectId: person.id,
    after: { fullName: input.fullName, personType: 'staff' },
  }, tx);
  await deps.audit.record({
    ...base,
    action: 'account.invited',
    subjectType: 'user_account',
    subjectId: account.id,
    after: { loginIdentifier: input.email, mfaRequired: true },
  }, tx);
  await deps.audit.record({
    ...base,
    action: 'assignment.granted',
    subjectType: 'role_assignment',
    subjectId: assignment.id,
    scopeType: 'institution',
    scopeRefId: null,
    after: { roleKey: COLLEGE_ADMIN_ROLE_KEY, source: 'bootstrap' },
    reason: 'Institution provisioning',
  }, tx);

  return {
    personId: person.id,
    accountId: account.id,
    assignmentId: assignment.id,
    invitationToken: token,
    invitationExpiresAt: expiresAt,
  };
}

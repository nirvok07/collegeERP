/**
 * Repository contracts required by M1. Defined by the application layer and
 * implemented in infrastructure, so use cases never name PostgreSQL.
 */
import type { Tx } from '../../../shared/application/unit-of-work.ts';
import type { ActiveAssignment } from '../domain/authority.ts';
import type { ScopeAncestry, ScopeType } from '../domain/scope.ts';
import type { AccountStatus } from '../domain/account-policy.ts';

export interface PersonRecord {
  id: string;
  tenantId: string;
  fullName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  personType: 'staff' | 'student' | 'guardian' | 'applicant' | 'external';
  status: 'provisional' | 'verified' | 'merged' | 'archived';
  version: number;
}

export interface AccountRecord {
  id: string;
  tenantId: string;
  personId: string;
  loginIdentifier: string;
  status: AccountStatus;
  mfaRequired: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  version: number;
}

export interface PlatformAccountRecord {
  id: string;
  email: string;
  fullName: string;
  status: 'active' | 'suspended' | 'deactivated';
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface PersonRepository {
  create(tx: Tx, input: Omit<PersonRecord, 'version'>): Promise<PersonRecord>;
  findById(tx: Tx, id: string): Promise<PersonRecord | null>;
  findByEmail(tx: Tx, email: string): Promise<PersonRecord | null>;
  /** The People list: person, account and role chips in one query. */
  list(tx: Tx, filter: PersonListFilter): Promise<PersonListItem[]>;
}

export interface AccountRepository {
  create(
    tx: Tx,
    input: Omit<AccountRecord, 'version' | 'failedAttempts' | 'lockedUntil'>,
  ): Promise<AccountRecord>;
  findByLoginIdentifier(tx: Tx, identifier: string): Promise<AccountRecord | null>;
  findById(tx: Tx, id: string): Promise<AccountRecord | null>;
  updateSecurityState(
    tx: Tx,
    id: string,
    state: { failedAttempts: number; lockedUntil: Date | null; status: AccountStatus },
  ): Promise<void>;
  markActivated(tx: Tx, id: string, at: Date): Promise<void>;
  recordSignIn(tx: Tx, id: string, at: Date): Promise<void>;
}

export interface CredentialRepository {
  set(tx: Tx, accountId: string, tenantId: string, hash: string): Promise<void>;
  findHash(tx: Tx, accountId: string): Promise<string | null>;
}

export interface PlatformAccountRepository {
  findByEmail(tx: Tx, email: string): Promise<PlatformAccountRecord | null>;
  findById(tx: Tx, id: string): Promise<PlatformAccountRecord | null>;
  findCredentialHash(tx: Tx, id: string): Promise<string | null>;
  updateSecurityState(
    tx: Tx,
    id: string,
    state: { failedAttempts: number; lockedUntil: Date | null; status: string },
  ): Promise<void>;
  recordSignIn(tx: Tx, id: string, at: Date): Promise<void>;
}

export interface RoleDefinitionRecord {
  id: string;
  tenantId: string | null;
  key: string;
  name: string;
  permissionKeys: string[];
  allowedScopeTypes: ScopeType[];
  requiresApproval: boolean;
  isSystem: boolean;
}

export interface RoleDefinitionRepository {
  findByKey(tx: Tx, key: string): Promise<RoleDefinitionRecord | null>;
  findById(tx: Tx, id: string): Promise<RoleDefinitionRecord | null>;
  listAvailable(tx: Tx): Promise<RoleDefinitionRecord[]>;
}

export interface CreateAssignmentInput {
  id: string;
  tenantId: string;
  personId: string;
  roleId: string;
  scopeType: ScopeType;
  scopeRefId: string | null;
  validFrom: Date;
  validTo: Date | null;
  source: 'bootstrap' | 'manual' | 'import' | 'automatic' | 'request';
  grantedByPerson: string | null;
  grantedByPlatform: string | null;
  reason: string | null;
}

export interface PersonListItem {
  personId: string;
  fullName: string;
  primaryEmail: string | null;
  personType: string;
  accountId: string | null;
  accountStatus: string | null;
  lastLoginAt: Date | null;
  roleKeys: string[];
}

export interface PersonListFilter {
  search?: string;
  personType?: string;
  accountStatus?: string;
  limit: number;
}

export interface AssignmentListItem {
  id: string;
  personId: string;
  personName: string;
  roleKey: string;
  roleName: string;
  scopeType: string;
  scopeRefId: string | null;
  validFrom: Date;
  validTo: Date | null;
  status: string;
  source: string;
  grantedAt: Date;
}

export interface RoleAssignmentRepository {
  create(tx: Tx, input: CreateAssignmentInput): Promise<{ id: string }>;
  /** Live assignments for a person, joined to their role's permission keys. */
  listActiveForPerson(tx: Tx, personId: string): Promise<ActiveAssignment[]>;
  /** BR-26 and BR-8: how many people currently administer this institution. */
  countActiveByRoleKey(tx: Tx, roleKey: string): Promise<number>;
  findActiveById(tx: Tx, id: string): Promise<AssignmentListItem | null>;
  listActive(tx: Tx, limit: number): Promise<AssignmentListItem[]>;
  revoke(
    tx: Tx,
    input: { id: string; revokedBy: string; reason: string; at: Date },
  ): Promise<boolean>;
}

export interface OrgTreeReader {
  /** Ancestry of a scope target, nearest first. Empty for institution scope. */
  ancestryOf(tx: Tx, scopeType: ScopeType, scopeRefId: string): Promise<ScopeAncestry[]>;
}

export interface InvitationRepository {
  issue(
    tx: Tx,
    input: { id: string; tenantId: string; accountId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void>;
  findValidByHash(
    tx: Tx,
    tokenHash: string,
    at: Date,
  ): Promise<{ id: string; accountId: string; tenantId: string } | null>;
  consume(tx: Tx, id: string, at: Date): Promise<void>;
}

export interface RefreshTokenRecord {
  id: string;
  familyId: string;
  tenantId: string | null;
  accountId: string | null;
  platformAccountId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

export interface RefreshTokenRepository {
  issue(
    tx: Tx,
    input: {
      id: string;
      familyId: string;
      tenantId: string | null;
      accountId: string | null;
      platformAccountId: string | null;
      tokenHash: string;
      expiresAt: Date;
    },
  ): Promise<void>;
  /**
   * Resolves a presented token before any tenant context exists. Backed by a
   * narrow SECURITY DEFINER function: an unguessable hash in, one row out.
   */
  resolve(tx: Tx, tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Marks a token exchanged and links its successor, so replay is detectable. */
  consume(tx: Tx, id: string, replacedBy: string, at: Date): Promise<void>;
  /** Reuse detection and sign-out both revoke the whole family. */
  revokeFamily(tx: Tx, familyId: string, reason: string): Promise<number>;
  revokeAllForAccount(tx: Tx, accountId: string, at: Date): Promise<void>;
}

export interface DeviceRecord {
  id: string;
  tenantId: string;
  personId: string;
  accountId: string;
  platform: string;
}

export interface DeviceRepository {
  create(
    tx: Tx,
    input: {
      id: string; tenantId: string; personId: string; accountId: string;
      platform: string; pushTokenHash: string;
      appVersion: string | null; deviceLabel: string | null;
    },
  ): Promise<void>;
  findActiveByTokenHash(tx: Tx, tokenHash: string): Promise<DeviceRecord | null>;
  /** Re-points an existing registration at the current account and marks it seen. */
  touch(
    tx: Tx,
    id: string,
    input: { personId: string; accountId: string; appVersion: string | null; at: Date },
  ): Promise<void>;
  revokeForAccount(tx: Tx, accountId: string, reason: string, at: Date): Promise<number>;
}

export interface LoginAttemptRepository {
  record(
    tx: Tx,
    input: {
      id: string;
      tenantId: string | null;
      identifierHash: string;
      accountId: string | null;
      outcome: 'success' | 'failure';
      failureReason: string | null;
      ipHash: string | null;
    },
  ): Promise<void>;
}

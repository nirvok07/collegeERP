import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  AccountRecord,
  DeviceRecord,
  DeviceRepository,
  AssignmentListItem,
  PersonListFilter,
  PersonListItem,
  RefreshTokenRecord,
  AccountRepository,
  CreateAssignmentInput,
  CredentialRepository,
  InvitationRepository,
  LoginAttemptRepository,
  OrgTreeReader,
  PersonRecord,
  PersonRepository,
  PlatformAccountRecord,
  PlatformAccountRepository,
  RefreshTokenRepository,
  RoleAssignmentRepository,
  RoleDefinitionRecord,
  RoleDefinitionRepository,
} from '../application/ports.ts';
import type { ActiveAssignment } from '../domain/authority.ts';
import type { ScopeAncestry, ScopeType } from '../domain/scope.ts';

export class PgPersonRepository implements PersonRepository {
  async create(tx: Tx, input: Omit<PersonRecord, 'version'>): Promise<PersonRecord> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO persons (id, tenant_id, full_name, primary_email, primary_phone, person_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, tenant_id, full_name, primary_email, primary_phone, person_type, status, version`,
      [input.id, input.tenantId, input.fullName, input.primaryEmail, input.primaryPhone, input.personType, input.status],
    );
    return toPerson(rows[0]);
  }

  async findById(tx: Tx, id: string): Promise<PersonRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, tenant_id, full_name, primary_email, primary_phone, person_type, status, version
         FROM persons WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ? toPerson(rows[0]) : null;
  }

  async findByEmail(tx: Tx, email: string): Promise<PersonRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, tenant_id, full_name, primary_email, primary_phone, person_type, status, version
         FROM persons WHERE primary_email = $1 AND deleted_at IS NULL`,
      [email],
    );
    return rows[0] ? toPerson(rows[0]) : null;
  }

  /**
   * One query for the list. Roles are aggregated rather than fetched per row,
   * because N+1 on the screen an administrator lives in is the difference
   * between a product that feels fast and one that does not.
   */
  async list(tx: Tx, filter: PersonListFilter): Promise<PersonListItem[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT p.id            AS person_id,
              p.full_name,
              p.primary_email,
              p.person_type,
              ua.id           AS account_id,
              ua.status       AS account_status,
              ua.last_login_at,
              COALESCE(
                array_agg(rd.key ORDER BY rd.key) FILTER (WHERE rd.key IS NOT NULL),
                '{}'
              ) AS role_keys
         FROM persons p
         LEFT JOIN user_accounts ua
                ON ua.person_id = p.id AND ua.status <> 'archived'
         LEFT JOIN role_assignments ra
                ON ra.person_id = p.id AND ra.status = 'active'
               AND ra.valid_from <= now()
               AND (ra.valid_to IS NULL OR ra.valid_to > now())
         LEFT JOIN role_definitions rd ON rd.id = ra.role_id
        WHERE p.deleted_at IS NULL
          AND ($1::text IS NULL OR p.full_name ILIKE '%' || $1 || '%'
                                OR p.primary_email ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR p.person_type = $2)
          AND ($3::text IS NULL OR ua.status = $3)
        GROUP BY p.id, ua.id
        ORDER BY p.full_name
        LIMIT $4`,
      [filter.search ?? null, filter.personType ?? null, filter.accountStatus ?? null, filter.limit],
    );
    return rows.map((r) => ({
      personId: r.person_id,
      fullName: r.full_name,
      primaryEmail: r.primary_email,
      personType: r.person_type,
      accountId: r.account_id,
      accountStatus: r.account_status,
      lastLoginAt: r.last_login_at,
      roleKeys: r.role_keys as string[],
    }));
  }
}

export class PgAccountRepository implements AccountRepository {
  async create(
    tx: Tx,
    input: Omit<AccountRecord, 'version' | 'failedAttempts' | 'lockedUntil'>,
  ): Promise<AccountRecord> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO user_accounts (id, tenant_id, person_id, login_identifier, status, mfa_required)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, tenant_id, person_id, login_identifier, status, mfa_required,
                 failed_attempts, locked_until, version`,
      [input.id, input.tenantId, input.personId, input.loginIdentifier, input.status, input.mfaRequired],
    );
    return toAccount(rows[0]);
  }

  async findByLoginIdentifier(tx: Tx, identifier: string): Promise<AccountRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, tenant_id, person_id, login_identifier, status, mfa_required,
              failed_attempts, locked_until, version
         FROM user_accounts
        WHERE login_identifier = $1 AND status NOT IN ('deactivated','archived')`,
      [identifier],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async findById(tx: Tx, id: string): Promise<AccountRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, tenant_id, person_id, login_identifier, status, mfa_required,
              failed_attempts, locked_until, version
         FROM user_accounts WHERE id = $1`,
      [id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async updateSecurityState(
    tx: Tx,
    id: string,
    state: { failedAttempts: number; lockedUntil: Date | null; status: string },
  ): Promise<void> {
    await clientOf(tx).query(
      `UPDATE user_accounts
          SET failed_attempts = $2, locked_until = $3, status = $4,
              updated_at = now(), version = version + 1
        WHERE id = $1`,
      [id, state.failedAttempts, state.lockedUntil, state.status],
    );
  }

  async markActivated(tx: Tx, id: string, at: Date): Promise<void> {
    await clientOf(tx).query(
      `UPDATE user_accounts
          SET status = 'active', activated_at = $2, failed_attempts = 0, locked_until = NULL,
              updated_at = now(), version = version + 1
        WHERE id = $1`,
      [id, at],
    );
  }

  async recordSignIn(tx: Tx, id: string, at: Date): Promise<void> {
    await clientOf(tx).query(`UPDATE user_accounts SET last_login_at = $2 WHERE id = $1`, [id, at]);
  }
}

export class PgCredentialRepository implements CredentialRepository {
  async set(tx: Tx, accountId: string, tenantId: string, hash: string): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO credentials (account_id, tenant_id, hash)
       VALUES ($1,$2,$3)
       ON CONFLICT (account_id) DO UPDATE SET hash = EXCLUDED.hash, updated_at = now()`,
      [accountId, tenantId, hash],
    );
  }

  async findHash(tx: Tx, accountId: string): Promise<string | null> {
    const { rows } = await clientOf(tx).query(`SELECT hash FROM credentials WHERE account_id = $1`, [accountId]);
    return rows[0]?.hash ?? null;
  }
}

export class PgPlatformAccountRepository implements PlatformAccountRepository {
  async findByEmail(tx: Tx, email: string): Promise<PlatformAccountRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, email, full_name, status, failed_attempts, locked_until
         FROM platform_accounts WHERE email = $1`,
      [email],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id, email: r.email, fullName: r.full_name, status: r.status,
          failedAttempts: r.failed_attempts, lockedUntil: r.locked_until,
        }
      : null;
  }

  async findById(tx: Tx, id: string): Promise<PlatformAccountRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, email, full_name, status, failed_attempts, locked_until
         FROM platform_accounts WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id, email: r.email, fullName: r.full_name, status: r.status,
          failedAttempts: r.failed_attempts, lockedUntil: r.locked_until,
        }
      : null;
  }

  async findCredentialHash(tx: Tx, id: string): Promise<string | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT credential_hash FROM platform_accounts WHERE id = $1`, [id],
    );
    return rows[0]?.credential_hash ?? null;
  }

  async updateSecurityState(
    tx: Tx, id: string,
    state: { failedAttempts: number; lockedUntil: Date | null; status: string },
  ): Promise<void> {
    await clientOf(tx).query(
      `UPDATE platform_accounts
          SET failed_attempts = $2, locked_until = $3, updated_at = now(), version = version + 1
        WHERE id = $1`,
      [id, state.failedAttempts, state.lockedUntil],
    );
  }

  async recordSignIn(tx: Tx, id: string, at: Date): Promise<void> {
    await clientOf(tx).query(`UPDATE platform_accounts SET last_login_at = $2 WHERE id = $1`, [id, at]);
  }
}

const ROLE_COLUMNS = `id, tenant_id, key, name, permission_keys, allowed_scope_types,
              requires_approval, is_system`;

export class PgRoleDefinitionRepository implements RoleDefinitionRepository {
  async findById(tx: Tx, id: string): Promise<RoleDefinitionRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT ${ROLE_COLUMNS} FROM role_definitions WHERE id = $1 AND status = 'active'`, [id],
    );
    return rows[0] ? toRole(rows[0]) : null;
  }

  async listAvailable(tx: Tx): Promise<RoleDefinitionRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT DISTINCT ON (key) ${ROLE_COLUMNS}
         FROM role_definitions WHERE status = 'active'
        ORDER BY key, tenant_id NULLS LAST`,
    );
    return rows.map(toRole);
  }

  async findByKey(tx: Tx, key: string): Promise<RoleDefinitionRecord | null> {
    // Tenant-cloned roles win over the platform template of the same key.
    const { rows } = await clientOf(tx).query(
      `SELECT id, tenant_id, key, name, permission_keys, allowed_scope_types,
              requires_approval, is_system
         FROM role_definitions
        WHERE key = $1 AND status = 'active'
        ORDER BY tenant_id NULLS LAST
        LIMIT 1`,
      [key],
    );
    return rows[0] ? toRole(rows[0]) : null;
  }
}

export class PgRoleAssignmentRepository implements RoleAssignmentRepository {
  async create(tx: Tx, input: CreateAssignmentInput): Promise<{ id: string }> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO role_assignments
         (id, tenant_id, person_id, role_id, scope_type, scope_ref_id, valid_from, valid_to,
          status, source, granted_by_person, granted_by_platform, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$12)
       RETURNING id`,
      [
        input.id, input.tenantId, input.personId, input.roleId, input.scopeType, input.scopeRefId,
        input.validFrom, input.validTo, input.source, input.grantedByPerson,
        input.grantedByPlatform, input.reason,
      ],
    );
    return { id: rows[0].id };
  }

  async listActiveForPerson(tx: Tx, personId: string): Promise<ActiveAssignment[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT ra.id, ra.role_id, rd.key AS role_key, rd.permission_keys,
              ra.scope_type, ra.scope_ref_id, ra.valid_from, ra.valid_to
         FROM role_assignments ra
         JOIN role_definitions rd ON rd.id = ra.role_id
        WHERE ra.person_id = $1
          AND ra.status = 'active'
          AND ra.valid_from <= now()
          AND (ra.valid_to IS NULL OR ra.valid_to > now())`,
      [personId],
    );
    return rows.map((r) => ({
      id: r.id,
      roleId: r.role_id,
      roleKey: r.role_key,
      permissionKeys: r.permission_keys as string[],
      scope: { type: r.scope_type as ScopeType, refId: r.scope_ref_id },
      validFrom: r.valid_from,
      validTo: r.valid_to,
    }));
  }

  async findActiveById(tx: Tx, id: string): Promise<AssignmentListItem | null> {
    const { rows } = await clientOf(tx).query(
      `${ASSIGNMENT_SELECT} WHERE ra.id = $1`, [id],
    );
    return rows[0] ? toAssignment(rows[0]) : null;
  }

  async listActive(tx: Tx, limit: number): Promise<AssignmentListItem[]> {
    const { rows } = await clientOf(tx).query(
      `${ASSIGNMENT_SELECT} WHERE ra.status = 'active' ORDER BY ra.granted_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toAssignment);
  }

  /**
   * Revocation is conditional on the row still being active, so two concurrent
   * revocations cannot both report success and write two audit events.
   */
  async revoke(
    tx: Tx,
    input: { id: string; revokedBy: string; reason: string; at: Date },
  ): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE role_assignments
          SET status = 'revoked', revoked_at = $2, revoked_by = $3,
              revocation_reason = $4, version = version + 1
        WHERE id = $1 AND status = 'active'`,
      [input.id, input.at, input.revokedBy, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }

  async countActiveByRoleKey(tx: Tx, roleKey: string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `SELECT count(*)::int AS n
         FROM role_assignments ra
         JOIN role_definitions rd ON rd.id = ra.role_id
        WHERE rd.key = $1 AND ra.status = 'active'`,
      [roleKey],
    );
    return rows[0]?.n ?? 0;
  }
}

export class PgOrgTreeReader implements OrgTreeReader {
  async ancestryOf(tx: Tx, scopeType: ScopeType, scopeRefId: string): Promise<ScopeAncestry[]> {
    if (scopeType === 'department') {
      const { rows } = await clientOf(tx).query(
        `SELECT campus_id FROM departments WHERE id = $1`, [scopeRefId],
      );
      return rows[0] ? [{ type: 'campus', refId: rows[0].campus_id }] : [];
    }

    if (scopeType === 'program') {
      const { rows } = await clientOf(tx).query(
        `SELECT p.department_id, d.campus_id
           FROM programs p JOIN departments d ON d.id = p.department_id
          WHERE p.id = $1`,
        [scopeRefId],
      );
      return rows[0]
        ? [
            { type: 'department', refId: rows[0].department_id },
            { type: 'campus', refId: rows[0].campus_id },
          ]
        : [];
    }

    // The chain this module's own contract has promised since migration 001:
    // a section yields [section, program, department, campus]. M3 now provides
    // the rows; the decision stays here, so there is one authorization path.
    if (scopeType === 'section') {
      const { rows } = await clientOf(tx).query(
        `SELECT s.program_id, p.department_id, d.campus_id
           FROM sections s
           JOIN programs p    ON p.id = s.program_id
           JOIN departments d ON d.id = p.department_id
          WHERE s.id = $1`,
        [scopeRefId],
      );
      return rows[0]
        ? [
            { type: 'program', refId: rows[0].program_id },
            { type: 'department', refId: rows[0].department_id },
            { type: 'campus', refId: rows[0].campus_id },
          ]
        : [];
    }

    return [];
  }
}

export class PgInvitationRepository implements InvitationRepository {
  async issue(
    tx: Tx,
    input: { id: string; tenantId: string; accountId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO invitation_tokens (id, tenant_id, account_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.tenantId, input.accountId, input.tokenHash, input.expiresAt],
    );
  }

  async findValidByHash(tx: Tx, tokenHash: string, at: Date) {
    const { rows } = await clientOf(tx).query(
      `SELECT id, account_id, tenant_id FROM invitation_tokens
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2`,
      [tokenHash, at],
    );
    const r = rows[0];
    return r ? { id: r.id, accountId: r.account_id, tenantId: r.tenant_id } : null;
  }

  async consume(tx: Tx, id: string, at: Date): Promise<void> {
    await clientOf(tx).query(`UPDATE invitation_tokens SET consumed_at = $2 WHERE id = $1`, [id, at]);
  }
}

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  async issue(
    tx: Tx,
    input: {
      id: string; familyId: string; tenantId: string | null; accountId: string | null;
      platformAccountId: string | null; tokenHash: string; expiresAt: Date;
    },
  ): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO refresh_tokens
         (id, family_id, tenant_id, account_id, platform_account_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.familyId, input.tenantId, input.accountId,
       input.platformAccountId, input.tokenHash, input.expiresAt],
    );
  }

  async resolve(tx: Tx, tokenHash: string): Promise<RefreshTokenRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT * FROM auth_resolve_refresh_token($1)`, [tokenHash],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id, familyId: r.family_id, tenantId: r.tenant_id, accountId: r.account_id,
          platformAccountId: r.platform_account_id, expiresAt: r.expires_at,
          consumedAt: r.consumed_at, revokedAt: r.revoked_at,
        }
      : null;
  }

  async consume(tx: Tx, id: string, replacedBy: string, at: Date): Promise<void> {
    await clientOf(tx).query(
      `UPDATE refresh_tokens SET consumed_at = $2, replaced_by = $3, last_used_at = $2 WHERE id = $1`,
      [id, at, replacedBy],
    );
  }

  async revokeFamily(tx: Tx, familyId: string, reason: string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `SELECT auth_revoke_token_family($1,$2) AS n`, [familyId, reason],
    );
    return rows[0]?.n ?? 0;
  }

  async revokeAllForAccount(tx: Tx, accountId: string, at: Date): Promise<void> {
    await clientOf(tx).query(
      `UPDATE refresh_tokens SET revoked_at = $2 WHERE account_id = $1 AND revoked_at IS NULL`,
      [accountId, at],
    );
  }
}

export class PgDeviceRepository implements DeviceRepository {
  async create(
    tx: Tx,
    input: {
      id: string; tenantId: string; personId: string; accountId: string;
      platform: string; pushTokenHash: string;
      appVersion: string | null; deviceLabel: string | null;
    },
  ): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO devices
         (id, tenant_id, person_id, account_id, platform, push_token_hash, app_version, device_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.personId, input.accountId, input.platform,
       input.pushTokenHash, input.appVersion, input.deviceLabel],
    );
  }

  async findActiveByTokenHash(tx: Tx, tokenHash: string): Promise<DeviceRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, tenant_id, person_id, account_id, platform
         FROM devices WHERE push_token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id, tenantId: r.tenant_id, personId: r.person_id,
          accountId: r.account_id, platform: r.platform,
        }
      : null;
  }

  async touch(
    tx: Tx,
    id: string,
    input: { personId: string; accountId: string; appVersion: string | null; at: Date },
  ): Promise<void> {
    await clientOf(tx).query(
      `UPDATE devices
          SET person_id = $2, account_id = $3, app_version = COALESCE($4, app_version),
              last_seen_at = $5
        WHERE id = $1`,
      [id, input.personId, input.accountId, input.appVersion, input.at],
    );
  }

  async revokeForAccount(tx: Tx, accountId: string, reason: string, at: Date): Promise<number> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE devices SET revoked_at = $2, revoked_reason = $3
        WHERE account_id = $1 AND revoked_at IS NULL`,
      [accountId, at, reason],
    );
    return rowCount ?? 0;
  }
}

export class PgLoginAttemptRepository implements LoginAttemptRepository {
  async record(
    tx: Tx,
    input: {
      id: string; tenantId: string | null; identifierHash: string; accountId: string | null;
      outcome: 'success' | 'failure'; failureReason: string | null; ipHash: string | null;
    },
  ): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO login_attempts (id, tenant_id, identifier_hash, account_id, outcome, failure_reason, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.identifierHash, input.accountId, input.outcome, input.failureReason, input.ipHash],
    );
  }
}

const ASSIGNMENT_SELECT = `
  SELECT ra.id, ra.person_id, p.full_name AS person_name, rd.key AS role_key,
         rd.name AS role_name, ra.scope_type, ra.scope_ref_id, ra.valid_from,
         ra.valid_to, ra.status, ra.source, ra.granted_at
    FROM role_assignments ra
    JOIN role_definitions rd ON rd.id = ra.role_id
    JOIN persons p ON p.id = ra.person_id`;

function toAssignment(r: any): AssignmentListItem {
  return {
    id: r.id, personId: r.person_id, personName: r.person_name, roleKey: r.role_key,
    roleName: r.role_name, scopeType: r.scope_type, scopeRefId: r.scope_ref_id,
    validFrom: r.valid_from, validTo: r.valid_to, status: r.status,
    source: r.source, grantedAt: r.granted_at,
  };
}

function toRole(r: any): RoleDefinitionRecord {
  return {
    id: r.id, tenantId: r.tenant_id, key: r.key, name: r.name,
    permissionKeys: r.permission_keys, allowedScopeTypes: r.allowed_scope_types,
    requiresApproval: r.requires_approval, isSystem: r.is_system,
  };
}

function toPerson(r: any): PersonRecord {
  return {
    id: r.id, tenantId: r.tenant_id, fullName: r.full_name, primaryEmail: r.primary_email,
    primaryPhone: r.primary_phone, personType: r.person_type, status: r.status, version: r.version,
  };
}

function toAccount(r: any): AccountRecord {
  return {
    id: r.id, tenantId: r.tenant_id, personId: r.person_id, loginIdentifier: r.login_identifier,
    status: r.status, mfaRequired: r.mfa_required, failedAttempts: r.failed_attempts,
    lockedUntil: r.locked_until, version: r.version,
  };
}

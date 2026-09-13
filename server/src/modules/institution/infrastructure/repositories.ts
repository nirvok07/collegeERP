import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  CampusRecord, CampusRepository, DepartmentRecord, DepartmentRepository,
  InstitutionRecord, InstitutionRepository,
} from '../application/ports.ts';
import type {
  PlatformAuditFilter, PlatformAuditReader, PlatformAuditRow,
} from '../application/platform-audit.ts';

const COLUMNS = `id, code, name, status, plan, seat_limit, timezone, version,
                 suspended_from, status_changed_at, created_at`;

export class PgInstitutionRepository implements InstitutionRepository {
  async create(tx: Tx, input: Omit<InstitutionRecord, 'version'>): Promise<InstitutionRecord> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO institutions (id, code, name, status, plan, seat_limit, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNS}`,
      [input.id, input.code, input.name, input.status, input.plan, input.seatLimit, input.timezone],
    );
    return toInstitution(rows[0]);
  }

  async findByCode(tx: Tx, code: string): Promise<InstitutionRecord | null> {
    const { rows } = await clientOf(tx).query(`SELECT ${COLUMNS} FROM institutions WHERE code = $1`, [code]);
    return rows[0] ? toInstitution(rows[0]) : null;
  }

  async findById(tx: Tx, id: string): Promise<InstitutionRecord | null> {
    const { rows } = await clientOf(tx).query(`SELECT ${COLUMNS} FROM institutions WHERE id = $1`, [id]);
    return rows[0] ? toInstitution(rows[0]) : null;
  }

  async list(tx: Tx, limit: number): Promise<InstitutionRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT ${COLUMNS} FROM institutions ORDER BY created_at DESC LIMIT $1`, [limit],
    );
    return rows.map(toInstitution);
  }

  async setStatus(
    tx: Tx, id: string, version: number, status: InstitutionRecord['status'],
  ): Promise<InstitutionRecord | null> {
    const { rows } = await clientOf(tx).query(
      `UPDATE institutions SET status = $3, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 RETURNING ${COLUMNS}`,
      [id, version, status],
    );
    return rows[0] ? toInstitution(rows[0]) : null;
  }
}

/** Department counts come from the same query as the campus, never per row. */
const CAMPUS_SELECT = `
  SELECT c.id, c.tenant_id, c.name, c.code, c.is_default, c.status, c.version,
         (SELECT count(*)::int FROM departments d
           WHERE d.campus_id = c.id AND d.status = 'active') AS department_count
    FROM campuses c`;

export class PgCampusRepository implements CampusRepository {
  async create(
    tx: Tx,
    input: { id: string; tenantId: string; name: string; code: string; isDefault: boolean },
  ): Promise<{ id: string }> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO campuses (id, tenant_id, name, code, is_default)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.id, input.tenantId, input.name, input.code, input.isDefault],
    );
    return { id: rows[0].id };
  }

  async findById(tx: Tx, id: string): Promise<CampusRecord | null> {
    const { rows } = await clientOf(tx).query(`${CAMPUS_SELECT} WHERE c.id = $1`, [id]);
    return rows[0] ? toCampus(rows[0]) : null;
  }

  async list(tx: Tx, includeArchived: boolean): Promise<CampusRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${CAMPUS_SELECT}
        WHERE ($1::boolean OR c.status = 'active')
        ORDER BY c.is_default DESC, c.name`,
      [includeArchived],
    );
    return rows.map(toCampus);
  }

  async rename(tx: Tx, id: string, name: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE campuses SET name = $2, updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`,
      [id, name],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Conditional on still being active, so two archivals cannot both succeed. */
  async archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE campuses
          SET status = 'archived', archived_at = $2, archived_by = $3,
              updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`,
      [id, at, by],
    );
    return (rowCount ?? 0) > 0;
  }
}

const DEPARTMENT_SELECT = `
  SELECT d.id, d.tenant_id, d.campus_id, c.name AS campus_name,
         d.name, d.code, d.status, d.version
    FROM departments d
    JOIN campuses c ON c.id = d.campus_id`;

export class PgDepartmentRepository implements DepartmentRepository {
  async create(
    tx: Tx,
    input: { id: string; tenantId: string; campusId: string; name: string; code: string },
  ): Promise<{ id: string }> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO departments (id, tenant_id, campus_id, name, code)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.id, input.tenantId, input.campusId, input.name, input.code],
    );
    return { id: rows[0].id };
  }

  async findById(tx: Tx, id: string): Promise<DepartmentRecord | null> {
    const { rows } = await clientOf(tx).query(`${DEPARTMENT_SELECT} WHERE d.id = $1`, [id]);
    return rows[0] ? toDepartment(rows[0]) : null;
  }

  async list(tx: Tx, includeArchived: boolean): Promise<DepartmentRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${DEPARTMENT_SELECT}
        WHERE ($1::boolean OR d.status = 'active')
        ORDER BY c.name, d.name`,
      [includeArchived],
    );
    return rows.map(toDepartment);
  }

  async rename(tx: Tx, id: string, name: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE departments SET name = $2, updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`,
      [id, name],
    );
    return (rowCount ?? 0) > 0;
  }

  async archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE departments
          SET status = 'archived', archived_at = $2, archived_by = $3,
              updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'active'`,
      [id, at, by],
    );
    return (rowCount ?? 0) > 0;
  }

  async countActive(tx: Tx, campusId: string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `SELECT count(*)::int AS n FROM departments
        WHERE campus_id = $1 AND status = 'active'`,
      [campusId],
    );
    return rows[0]?.n ?? 0;
  }
}

function toCampus(r: any): CampusRecord {
  return {
    id: r.id, tenantId: r.tenant_id, name: r.name, code: r.code,
    isDefault: r.is_default, status: r.status,
    departmentCount: r.department_count, version: r.version,
  };
}

function toDepartment(r: any): DepartmentRecord {
  return {
    id: r.id, tenantId: r.tenant_id, campusId: r.campus_id, campusName: r.campus_name,
    name: r.name, code: r.code, status: r.status, version: r.version,
  };
}

function toInstitution(r: any): InstitutionRecord {
  return {
    id: r.id, code: r.code, name: r.name, status: r.status, plan: r.plan,
    seatLimit: r.seat_limit, timezone: r.timezone, version: r.version,
    suspendedFrom: r.suspended_from ?? null, statusChangedAt: r.status_changed_at ?? null,
    createdAt: r.created_at,
  };
}

/** SA-2. Reads through platform_audit_events (migration 020), never the table directly. */
export class PgPlatformAuditReader implements PlatformAuditReader {
  async list(tx: Tx, f: PlatformAuditFilter): Promise<PlatformAuditRow[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT * FROM platform_audit_events($1, $2, $3, $4, $5, $6, $7)`,
      [f.tenantId, f.action, f.from, f.to, f.before?.at ?? null, f.before?.id ?? null, f.limit],
    );
    return rows.map((r: any) => ({
      id: r.id,
      at: r.at,
      cursorAt: r.cursor_at,
      correlationId: r.correlation_id,
      college: r.tenant_id ? { id: r.tenant_id, code: r.college_code, name: r.college_name } : null,
      actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, email: r.actor_email } : null,
      action: r.action,
      subject: { type: r.subject_type, id: r.subject_id },
      before: r.before_state,
      after: r.after_state,
      reason: r.reason,
    }));
  }
}

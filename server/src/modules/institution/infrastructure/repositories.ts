import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type { CampusRepository, InstitutionRecord, InstitutionRepository } from '../application/ports.ts';

const COLUMNS = `id, code, name, status, plan, seat_limit, timezone, version`;

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
}

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
}

function toInstitution(r: any): InstitutionRecord {
  return {
    id: r.id, code: r.code, name: r.name, status: r.status, plan: r.plan,
    seatLimit: r.seat_limit, timezone: r.timezone, version: r.version,
  };
}

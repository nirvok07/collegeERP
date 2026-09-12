import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  AcademicYearRecord, AcademicYearRepository, SectionFilter, SectionRecord,
  SectionRepository, SectionStatus, TermRecord, TermRepository,
} from '../application/ports.ts';

const YEAR_SELECT = `
  SELECT y.id, y.name, y.starts_on, y.ends_on, y.is_current, y.status,
         (SELECT count(*)::int FROM terms t WHERE t.academic_year_id = y.id) AS term_count
    FROM academic_years y`;

export class PgAcademicYearRepository implements AcademicYearRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO academic_years (id, tenant_id, name, starts_on, ends_on, is_current)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.tenantId, input.name, input.startsOn, input.endsOn, input.isCurrent],
    );
  }

  async findById(tx: Tx, id: string): Promise<AcademicYearRecord | null> {
    const { rows } = await clientOf(tx).query(`${YEAR_SELECT} WHERE y.id = $1`, [id]);
    return rows[0] ? toYear(rows[0]) : null;
  }

  async list(tx: Tx): Promise<AcademicYearRecord[]> {
    const { rows } = await clientOf(tx).query(`${YEAR_SELECT} ORDER BY y.starts_on DESC`);
    return rows.map(toYear);
  }

  async clearCurrent(tx: Tx): Promise<void> {
    await clientOf(tx).query(`UPDATE academic_years SET is_current = false WHERE is_current`);
  }

  async setCurrent(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE academic_years SET is_current = true, updated_at = now(), version = version + 1
        WHERE id = $1`, [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

const TERM_SELECT = `
  SELECT t.id, t.academic_year_id, y.name AS academic_year_name, t.sequence, t.name,
         t.starts_on, t.ends_on, t.status
    FROM terms t JOIN academic_years y ON y.id = t.academic_year_id`;

export class PgTermRepository implements TermRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; academicYearId: string; sequence: number;
    name: string; startsOn: string; endsOn: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO terms (id, tenant_id, academic_year_id, sequence, name, starts_on, ends_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.academicYearId, input.sequence,
       input.name, input.startsOn, input.endsOn],
    );
  }

  async findById(tx: Tx, id: string): Promise<TermRecord | null> {
    const { rows } = await clientOf(tx).query(`${TERM_SELECT} WHERE t.id = $1`, [id]);
    return rows[0] ? toTerm(rows[0]) : null;
  }

  async list(tx: Tx, academicYearId: string | null): Promise<TermRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${TERM_SELECT}
        WHERE ($1::uuid IS NULL OR t.academic_year_id = $1)
        ORDER BY y.starts_on DESC, t.sequence`,
      [academicYearId],
    );
    return rows.map(toTerm);
  }
}

/**
 * Sections carry their whole organisational context in one query. An operator
 * scanning a section list needs campus, department and program on every row,
 * and fetching them per row would be N+1 on the module's busiest screen.
 */
const SECTION_SELECT = `
  SELECT s.id, s.program_id, p.name AS program_name, p.code AS program_code,
         d.name AS department_name, c.name AS campus_name,
         s.academic_year_id, y.name AS academic_year_name,
         s.term_id, t.name AS term_name, s.term_number, s.label, s.capacity,
         s.status, s.cancelled_reason
    FROM sections s
    JOIN programs p       ON p.id = s.program_id
    JOIN departments d    ON d.id = p.department_id
    JOIN campuses c       ON c.id = d.campus_id
    JOIN academic_years y ON y.id = s.academic_year_id
    JOIN terms t          ON t.id = s.term_id`;

export class PgSectionRepository implements SectionRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; programId: string; academicYearId: string;
    termId: string; termNumber: number; label: string; capacity: number | null;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO sections
         (id, tenant_id, program_id, academic_year_id, term_id, term_number, label, capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.programId, input.academicYearId,
       input.termId, input.termNumber, input.label, input.capacity],
    );
  }

  async findById(tx: Tx, id: string): Promise<SectionRecord | null> {
    const { rows } = await clientOf(tx).query(`${SECTION_SELECT} WHERE s.id = $1`, [id]);
    return rows[0] ? toSection(rows[0]) : null;
  }

  async list(tx: Tx, filter: SectionFilter): Promise<SectionRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${SECTION_SELECT}
        WHERE ($1::uuid IS NULL OR s.academic_year_id = $1)
          AND ($2::uuid IS NULL OR s.term_id = $2)
          AND ($3::uuid IS NULL OR s.program_id = $3)
          AND ($4::text IS NULL OR s.status = $4)
        ORDER BY y.starts_on DESC, p.name, s.term_number, s.label
        LIMIT 500`,
      [filter.academicYearId ?? null, filter.termId ?? null,
       filter.programId ?? null, filter.status ?? null],
    );
    return rows.map(toSection);
  }

  /** Conditional on the source state, so two concurrent transitions cannot both win. */
  async transition(tx: Tx, input: {
    id: string; from: SectionStatus; to: SectionStatus; at: Date; reason: string | null;
  }): Promise<boolean> {
    const column = {
      open: 'opened_at', active: 'activated_at',
      completed: 'completed_at', cancelled: 'cancelled_at', planned: null,
    }[input.to];

    // The parameter list is fixed regardless of which timestamp column applies,
    // so no branch can reference a parameter it did not pass.
    const { rowCount } = await clientOf(tx).query(
      `UPDATE sections
          SET status = $3,
              ${column ? `${column} = $4,` : ''}
              -- $4 is the transition time, so it is always referenced. Returning
              -- to planned records no milestone but is still an update.
              updated_at = $4,
              cancelled_reason = CASE WHEN $3 = 'cancelled' THEN $5 ELSE cancelled_reason END,
              version = version + 1
        WHERE id = $1 AND status = $2`,
      [input.id, input.from, input.to, input.at, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }

  async setCapacity(tx: Tx, id: string, capacity: number | null): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE sections SET capacity = $2, updated_at = now(), version = version + 1
        WHERE id = $1 AND status NOT IN ('completed','cancelled')`,
      [id, capacity],
    );
    return (rowCount ?? 0) > 0;
  }
}

function toYear(r: any): AcademicYearRecord {
  return {
    id: r.id, name: r.name,
    startsOn: toDateString(r.starts_on), endsOn: toDateString(r.ends_on),
    isCurrent: r.is_current, status: r.status, termCount: r.term_count,
  };
}

function toTerm(r: any): TermRecord {
  return {
    id: r.id, academicYearId: r.academic_year_id, academicYearName: r.academic_year_name,
    sequence: r.sequence, name: r.name,
    startsOn: toDateString(r.starts_on), endsOn: toDateString(r.ends_on), status: r.status,
  };
}

function toSection(r: any): SectionRecord {
  return {
    id: r.id, programId: r.program_id, programName: r.program_name,
    programCode: r.program_code, departmentName: r.department_name,
    campusName: r.campus_name, academicYearId: r.academic_year_id,
    academicYearName: r.academic_year_name, termId: r.term_id, termName: r.term_name,
    termNumber: r.term_number, label: r.label, capacity: r.capacity,
    status: r.status, cancelledReason: r.cancelled_reason,
  };
}

/** Dates stay calendar dates. A timestamp would drag a timezone into a date. */
function toDateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

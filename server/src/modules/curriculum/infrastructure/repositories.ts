import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  CourseRecord, CourseRepository, CurriculumEntryRecord, CurriculumRepository,
  CurriculumVersionRecord, ProgramRecord, ProgramRepository,
} from '../application/ports.ts';

const PROGRAM_SELECT = `
  SELECT p.id, p.department_id, d.name AS department_name, p.name, p.code, p.award,
         p.duration_years, p.term_type, p.status,
         (SELECT count(*)::int FROM curriculum_versions v
           WHERE v.program_id = p.id AND v.status IN ('published','superseded')) AS published_versions
    FROM programs p JOIN departments d ON d.id = p.department_id`;

export class PgProgramRepository implements ProgramRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; departmentId: string; name: string; code: string;
    award: string | null; durationYears: number; termType: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO programs (id, tenant_id, department_id, name, code, award, duration_years, term_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.departmentId, input.name, input.code,
       input.award, input.durationYears, input.termType],
    );
  }

  async findById(tx: Tx, id: string): Promise<ProgramRecord | null> {
    const { rows } = await clientOf(tx).query(`${PROGRAM_SELECT} WHERE p.id = $1`, [id]);
    return rows[0] ? toProgram(rows[0]) : null;
  }

  async list(tx: Tx, includeArchived: boolean): Promise<ProgramRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${PROGRAM_SELECT} WHERE ($1::boolean OR p.status = 'active') ORDER BY d.name, p.name`,
      [includeArchived],
    );
    return rows.map(toProgram);
  }

  async archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE programs SET status='archived', archived_at=$2, archived_by=$3,
              updated_at=now(), version=version+1
        WHERE id=$1 AND status='active'`,
      [id, at, by],
    );
    return (rowCount ?? 0) > 0;
  }

  async rename(tx: Tx, id: string, input: { name: string; award: string | null }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE programs SET name=$2, award=$3, updated_at=now(), version=version+1
        WHERE id=$1 AND status='active'`,
      [id, input.name, input.award],
    );
    return (rowCount ?? 0) > 0;
  }
}

const COURSE_SELECT = `
  SELECT c.id, c.code, c.title, c.description, c.status,
         (SELECT count(*)::int FROM curriculum_entries e WHERE e.course_id = c.id) AS used_in_versions
    FROM courses c`;

export class PgCourseRepository implements CourseRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; code: string; title: string; description: string | null;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO courses (id, tenant_id, code, title, description) VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.tenantId, input.code, input.title, input.description],
    );
  }

  async findById(tx: Tx, id: string): Promise<CourseRecord | null> {
    const { rows } = await clientOf(tx).query(`${COURSE_SELECT} WHERE c.id = $1`, [id]);
    return rows[0] ? toCourse(rows[0]) : null;
  }

  async findByCode(tx: Tx, code: string): Promise<CourseRecord | null> {
    const { rows } = await clientOf(tx).query(`${COURSE_SELECT} WHERE c.code = $1`, [code]);
    return rows[0] ? toCourse(rows[0]) : null;
  }

  async list(tx: Tx, search: string | null, includeArchived: boolean): Promise<CourseRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${COURSE_SELECT}
        WHERE ($1::boolean OR c.status = 'active')
          AND ($2::text IS NULL OR c.code ILIKE '%' || $2 || '%' OR c.title ILIKE '%' || $2 || '%')
        ORDER BY c.code
        LIMIT 500`,
      [includeArchived, search],
    );
    return rows.map(toCourse);
  }

  async retitle(tx: Tx, id: string, title: string, description: string | null): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE courses SET title=$2, description=$3, updated_at=now(), version=version+1
        WHERE id=$1 AND status='active'`,
      [id, title, description],
    );
    return (rowCount ?? 0) > 0;
  }
}

const VERSION_SELECT = `
  SELECT v.id, v.program_id, p.name AS program_name, v.regulation_year, v.revision,
         v.title, v.status, v.total_terms, v.published_at, v.superseded_by,
         (SELECT count(*)::int FROM curriculum_entries e WHERE e.curriculum_version_id = v.id) AS entry_count,
         COALESCE((SELECT sum(e.credits) FROM curriculum_entries e
                    WHERE e.curriculum_version_id = v.id), 0) AS total_credits
    FROM curriculum_versions v JOIN programs p ON p.id = v.program_id`;

export class PgCurriculumRepository implements CurriculumRepository {
  async createVersion(tx: Tx, input: {
    id: string; tenantId: string; programId: string; regulationYear: number;
    revision: number; title: string | null; totalTerms: number;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO curriculum_versions
         (id, tenant_id, program_id, regulation_year, revision, title, total_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.programId, input.regulationYear,
       input.revision, input.title, input.totalTerms],
    );
  }

  async findVersion(tx: Tx, id: string): Promise<CurriculumVersionRecord | null> {
    const { rows } = await clientOf(tx).query(`${VERSION_SELECT} WHERE v.id = $1`, [id]);
    return rows[0] ? toVersion(rows[0]) : null;
  }

  async listVersions(tx: Tx, programId: string | null): Promise<CurriculumVersionRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${VERSION_SELECT}
        WHERE v.status <> 'discarded' AND ($1::uuid IS NULL OR v.program_id = $1)
        ORDER BY p.name, v.regulation_year DESC, v.revision DESC`,
      [programId],
    );
    return rows.map(toVersion);
  }

  async findPublished(tx: Tx, programId: string, regulationYear: number): Promise<CurriculumVersionRecord | null> {
    const { rows } = await clientOf(tx).query(
      `${VERSION_SELECT}
        WHERE v.program_id = $1 AND v.regulation_year = $2 AND v.status = 'published'`,
      [programId, regulationYear],
    );
    return rows[0] ? toVersion(rows[0]) : null;
  }

  async publish(tx: Tx, id: string, by: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE curriculum_versions
          SET status='published', published_at=$2, published_by=$3, updated_at=now(), version=version+1
        WHERE id=$1 AND status='draft'`,
      [id, at, by],
    );
    return (rowCount ?? 0) > 0;
  }

  async supersede(tx: Tx, id: string, byVersionId: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE curriculum_versions
          SET status='superseded', superseded_by=$2, superseded_at=$3
        WHERE id=$1 AND status='published'`,
      [id, byVersionId, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async discard(tx: Tx, id: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE curriculum_versions SET status='discarded', discarded_at=$2
        WHERE id=$1 AND status='draft'`,
      [id, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async listEntries(tx: Tx, versionId: string): Promise<CurriculumEntryRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT e.id, e.course_id, c.code AS course_code, c.title AS course_title,
              e.term_number, e.credits, e.requirement, e.elective_group, e.sequence
         FROM curriculum_entries e JOIN courses c ON c.id = e.course_id
        WHERE e.curriculum_version_id = $1
        ORDER BY e.term_number, e.sequence, c.code`,
      [versionId],
    );
    return rows.map((r) => ({
      id: r.id, courseId: r.course_id, courseCode: r.course_code, courseTitle: r.course_title,
      termNumber: r.term_number, credits: Number(r.credits), requirement: r.requirement,
      electiveGroup: r.elective_group, sequence: r.sequence,
    }));
  }

  async addEntry(tx: Tx, input: {
    id: string; tenantId: string; versionId: string; courseId: string;
    termNumber: number; credits: number; requirement: string;
    electiveGroup: string | null; sequence: number;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO curriculum_entries
         (id, tenant_id, curriculum_version_id, course_id, term_number, credits,
          requirement, elective_group, sequence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [input.id, input.tenantId, input.versionId, input.courseId, input.termNumber,
       input.credits, input.requirement, input.electiveGroup, input.sequence],
    );
  }

  async removeEntry(tx: Tx, versionId: string, entryId: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `DELETE FROM curriculum_entries WHERE id=$1 AND curriculum_version_id=$2`,
      [entryId, versionId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** One statement, so a large curriculum copies without a round trip per row. */
  async copyEntries(tx: Tx, fromVersionId: string, toVersionId: string, newId: () => string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `SELECT id FROM curriculum_entries WHERE curriculum_version_id = $1 ORDER BY term_number, sequence`,
      [fromVersionId],
    );
    if (rows.length === 0) return 0;

    const ids = rows.map(() => newId());
    const { rowCount } = await clientOf(tx).query(
      `INSERT INTO curriculum_entries
         (id, tenant_id, curriculum_version_id, course_id, term_number, credits,
          requirement, elective_group, sequence)
       SELECT new_id, e.tenant_id, $2, e.course_id, e.term_number, e.credits,
              e.requirement, e.elective_group, e.sequence
         FROM curriculum_entries e
         JOIN unnest($3::uuid[], $4::uuid[]) AS m(old_id, new_id) ON m.old_id = e.id
        WHERE e.curriculum_version_id = $1`,
      [fromVersionId, toVersionId, rows.map((r) => r.id), ids],
    );
    return rowCount ?? 0;
  }
}

function toProgram(r: any): ProgramRecord {
  return {
    id: r.id, departmentId: r.department_id, departmentName: r.department_name,
    name: r.name, code: r.code, award: r.award,
    durationYears: Number(r.duration_years), termType: r.term_type,
    status: r.status, publishedVersions: r.published_versions,
  };
}

function toCourse(r: any): CourseRecord {
  return {
    id: r.id, code: r.code, title: r.title, description: r.description,
    status: r.status, usedInVersions: r.used_in_versions,
  };
}

function toVersion(r: any): CurriculumVersionRecord {
  return {
    id: r.id, programId: r.program_id, programName: r.program_name,
    regulationYear: r.regulation_year, revision: r.revision, title: r.title,
    status: r.status, totalTerms: r.total_terms, publishedAt: r.published_at,
    supersededById: r.superseded_by, entryCount: r.entry_count,
    totalCredits: Number(r.total_credits),
  };
}

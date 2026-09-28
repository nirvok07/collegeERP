import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  SyllabusFileRow, SyllabusRecord, SyllabusRepository, SyllabusScope, SyllabusUploadInput,
} from '../application/ports.ts';

function toRecord(r: any): SyllabusRecord {
  return {
    id: r.id,
    courseId: r.course_id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    academicYearId: r.academic_year_id,
    academicYearName: r.academic_year_name,
    fileName: r.file_name,
    contentType: r.content_type,
    byteSize: Number(r.byte_size),
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    uploadedAt: r.uploaded_at,
  };
}

function toFileRow(r: any): SyllabusFileRow {
  return {
    id: r.id,
    fileName: r.file_name,
    contentType: r.content_type,
    byteSize: Number(r.byte_size),
    mediaReference: r.media_reference,
  };
}

/**
 * The projection every scoped query shares: a syllabus row joined to its
 * course and academic year, plus the uploader's name.
 */
const SELECT_ROWS = `
  SELECT sy.id, sy.course_id, sy.academic_year_id, sy.file_name, sy.content_type,
         sy.byte_size, sy.media_reference, sy.uploaded_by, sy.uploaded_at,
         c.code AS course_code, c.title AS course_title,
         ay.name AS academic_year_name, p.full_name AS uploaded_by_name
    FROM syllabus sy
    JOIN courses c        ON c.id = sy.course_id
    JOIN academic_years ay ON ay.id = sy.academic_year_id
    JOIN persons p        ON p.id = sy.uploaded_by`;

/**
 * The server-side scope, expressed once. A caller never passes course ids;
 * they are derived from the caller's own bindings, so nobody reads another
 * person's or another course's syllabus by guessing an id.
 *
 *   all     → the whole college (admin/HOD).
 *   staff   → courses the person currently teaches (live instructor
 *             assignment on any live offering of the course).
 *   student → courses offered in the person's live section.
 */
function scopeWhere(scope: SyllabusScope, personId: string): { where: string; params: unknown[] } {
  if (scope === 'all') return { where: 'sy.tenant_id = $1', params: [] };
  if (scope === 'staff') {
    return {
      where: `
        sy.tenant_id = $1
        AND sy.course_id IN (
          SELECT DISTINCT o.course_id
            FROM course_offerings o
            JOIN instructor_assignments ia
              ON ia.offering_id = o.id AND ia.valid_to IS NULL AND ia.person_id = $2
        )`,
      params: [personId],
    };
  }
  return {
    where: `
      sy.tenant_id = $1
      AND sy.course_id IN (
        SELECT DISTINCT o.course_id
          FROM course_offerings o
          JOIN section_memberships m ON m.section_id = o.section_id AND m.valid_to IS NULL
          JOIN students s ON s.id = m.student_id
         WHERE s.person_id = $2
      )`,
    params: [personId],
  };
}

export class PgSyllabusRepository implements SyllabusRepository {
  async upsert(tx: Tx, input: SyllabusUploadInput & { tenantId: string; id: string }): Promise<{
    replaced: boolean;
    previousReference: string | null;
  }> {
    const before = await clientOf(tx).query<{ media_reference: string }>(
      `SELECT media_reference FROM syllabus
        WHERE tenant_id = $1 AND course_id = $2 AND academic_year_id = $3`,
      [input.tenantId, input.courseId, input.academicYearId],
    );
    const previousReference = before.rows[0]?.media_reference ?? null;

    await clientOf(tx).query(
      `INSERT INTO syllabus
         (id, tenant_id, course_id, academic_year_id, media_reference, file_name, content_type, byte_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, course_id, academic_year_id) DO UPDATE SET
         id              = EXCLUDED.id,
         media_reference = EXCLUDED.media_reference,
         file_name       = EXCLUDED.file_name,
         content_type    = EXCLUDED.content_type,
         byte_size       = EXCLUDED.byte_size,
         uploaded_by     = EXCLUDED.uploaded_by,
         uploaded_at     = now(),
         version         = syllabus.version + 1`,
      [input.id, input.tenantId, input.courseId, input.academicYearId, input.mediaReference,
       input.fileName, input.contentType, input.byteSize, input.uploadedBy],
    );
    return { replaced: previousReference !== null, previousReference };
  }

  async findById(tx: Tx, tenantId: string, id: string): Promise<SyllabusRecord | null> {
    const { rows } = await clientOf(tx).query(`${SELECT_ROWS} WHERE sy.id = $1 AND sy.tenant_id = $2`, [id, tenantId]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listForActor(tx: Tx, tenantId: string, personId: string, scope: SyllabusScope): Promise<SyllabusRecord[]> {
    const { where, params } = scopeWhere(scope, personId);
    const { rows } = await clientOf(tx).query(
      `${SELECT_ROWS} WHERE ${where} ORDER BY c.title, ay.starts_on DESC`,
      [tenantId, ...params],
    );
    return rows.map(toRecord);
  }

  async findAccessible(
    tx: Tx, tenantId: string, personId: string, scope: SyllabusScope, id: string,
  ): Promise<SyllabusFileRow | null> {
    const { where, params } = scopeWhere(scope, personId);
    const { rows } = await clientOf(tx).query(
      `${SELECT_ROWS} WHERE ${where} AND sy.id = $${params.length + 2}`,
      [tenantId, ...params, id],
    );
    return rows[0] ? toFileRow(rows[0]) : null;
  }

  async remove(tx: Tx, tenantId: string, id: string): Promise<{ removed: boolean; mediaReference: string | null }> {
    const { rows } = await clientOf(tx).query<{ media_reference: string }>(
      `DELETE FROM syllabus WHERE id = $1 AND tenant_id = $2 RETURNING media_reference`,
      [id, tenantId],
    );
    return { removed: rows.length > 0, mediaReference: rows[0]?.media_reference ?? null };
  }
}

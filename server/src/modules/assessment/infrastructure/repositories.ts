import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  AssessmentCorrectionRecord, AssessmentMarkRecord, AssessmentMarkRepository, ComponentFilter,
  ComponentKind, ComponentRecord, ComponentRepository, MarkStatus,
} from '../application/ports.ts';

/**
 * A component carries its whole teaching context in one query: course, cohort,
 * term and the teacher leading it. The verification queue, the plan editor and
 * the teacher's own list all read the same facts, and two queries would drift.
 */
const COMPONENT_SELECT = `
  SELECT c.id, c.offering_id, c.name, c.kind, c.max_marks, c.weight, c.held_on, c.status,
         c.submitted_at, sp.full_name AS submitted_by_name,
         c.verified_at, vp.full_name AS verified_by_name,
         c.cancelled_reason, c.version,
         (SELECT count(*)::int FROM assessment_marks m WHERE m.component_id = c.id) AS mark_count,
         o.section_id, co.code AS course_code, co.title AS course_title,
         s.label AS section_label, p.name AS program_name, s.term_id, t.name AS term_name,
         lead_person.full_name AS teacher_name
    FROM assessment_components c
    JOIN course_offerings o ON o.id = c.offering_id
    JOIN courses co ON co.id = o.course_id
    JOIN sections s ON s.id = o.section_id
    JOIN programs p ON p.id = s.program_id
    JOIN terms t ON t.id = s.term_id
    LEFT JOIN persons sp ON sp.id = c.submitted_by
    LEFT JOIN persons vp ON vp.id = c.verified_by
    LEFT JOIN instructor_assignments ia
           ON ia.offering_id = o.id AND ia.valid_to IS NULL AND ia.role = 'lead'
    LEFT JOIN persons lead_person ON lead_person.id = ia.person_id`;

export class PgComponentRepository implements ComponentRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; name: string; kind: ComponentKind;
    maxMarks: number; weight: number; createdBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO assessment_components
         (id, tenant_id, offering_id, name, kind, max_marks, weight, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.id, input.tenantId, input.offeringId, input.name, input.kind,
        input.maxMarks, input.weight, input.createdBy],
    );
  }

  async findById(tx: Tx, id: string): Promise<ComponentRecord | null> {
    const { rows } = await clientOf(tx).query(`${COMPONENT_SELECT} WHERE c.id = $1`, [id]);
    return rows[0] ? toComponent(rows[0]) : null;
  }

  async list(tx: Tx, filter: ComponentFilter): Promise<ComponentRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (clause: (n: number) => string, value: unknown) => {
      values.push(value);
      where.push(clause(values.length));
    };
    if (filter.offeringId) add((n) => `c.offering_id = $${n}`, filter.offeringId);
    if (filter.status) add((n) => `c.status = $${n}`, filter.status);
    if (filter.sectionId) add((n) => `o.section_id = $${n}`, filter.sectionId);
    // Derived from M3's assignments, never from anything a client sends.
    if (filter.minePersonId) {
      add((n) => `EXISTS (SELECT 1 FROM instructor_assignments mine
                           WHERE mine.offering_id = o.id AND mine.person_id = $${n}
                             AND mine.valid_to IS NULL)`, filter.minePersonId);
    }
    const { rows } = await clientOf(tx).query(
      `${COMPONENT_SELECT}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY co.code, c.held_on NULLS LAST, c.created_at`, values,
    );
    return rows.map(toComponent);
  }

  async revise(tx: Tx, input: {
    id: string; name: string; kind: ComponentKind; maxMarks: number; weight: number;
    expectedVersion: number;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE assessment_components
          SET name = $2, kind = $3, max_marks = $4, weight = $5,
              updated_at = now(), version = version + 1
        WHERE id = $1 AND version = $6 AND status = 'draft'`,
      [input.id, input.name, input.kind, input.maxMarks, input.weight, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async setHeldOn(tx: Tx, input: { id: string; heldOn: string; expectedVersion: number }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE assessment_components SET held_on = $2, updated_at = now(), version = version + 1
        WHERE id = $1 AND version = $3 AND status = 'draft'`,
      [input.id, input.heldOn, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async touch(tx: Tx, input: { id: string; expectedVersion: number }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE assessment_components SET updated_at = now(), version = version + 1
        WHERE id = $1 AND version = $2 AND status = 'draft'`,
      [input.id, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async submit(tx: Tx, input: { id: string; by: string; at: Date; expectedVersion: number }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE assessment_components
          SET status = 'submitted', submitted_at = $3, submitted_by = $2,
              updated_at = $3, version = version + 1
        WHERE id = $1 AND version = $4 AND status = 'draft'`,
      [input.id, input.by, input.at, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async verify(tx: Tx, input: { id: string; by: string; at: Date; expectedVersion: number }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE assessment_components
          SET status = 'verified', verified_at = $3, verified_by = $2,
              updated_at = $3, version = version + 1
        WHERE id = $1 AND version = $4 AND status = 'submitted'`,
      [input.id, input.by, input.at, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async cancel(tx: Tx, input: { id: string; reason: string; expectedVersion: number }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE assessment_components
          SET status = 'cancelled', cancelled_reason = $2, updated_at = now(), version = version + 1
        WHERE id = $1 AND version = $3 AND status = 'draft'`,
      [input.id, input.reason, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async weightTotal(tx: Tx, offeringId: string): Promise<number> {
    const { rows } = await clientOf(tx).query(
      `SELECT coalesce(sum(weight), 0) AS total FROM assessment_components
        WHERE offering_id = $1 AND status <> 'cancelled'`, [offeringId],
    );
    return Number(rows[0]?.total ?? 0);
  }
}

/* ----------------------------------------------------------------- marks -- */

export class PgAssessmentMarkRepository implements AssessmentMarkRepository {
  async listForComponent(tx: Tx, componentId: string): Promise<AssessmentMarkRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT m.id, m.student_id, m.status, m.score, m.note, p.full_name AS marked_by_name,
              m.marked_at, m.version
         FROM assessment_marks m
         LEFT JOIN persons p ON p.id = m.marked_by
        WHERE m.component_id = $1`, [componentId],
    );
    return rows.map(toMark);
  }

  /**
   * One INSERT for the sheet, the conflict path updating. The trigger still
   * fires per row, so one ineligible student or one score over the maximum
   * fails the whole statement, which is the right outcome for a mark sheet.
   */
  async upsertMany(tx: Tx, input: {
    componentId: string; tenantId: string; markedBy: string; at: Date;
    marks: ReadonlyArray<{
      id: string; studentId: string; status: MarkStatus; score: number | null; note: string | null;
    }>;
  }): Promise<void> {
    if (input.marks.length === 0) return;
    await clientOf(tx).query(
      `INSERT INTO assessment_marks
         (id, tenant_id, component_id, student_id, status, score, note, marked_by, marked_at)
       SELECT m.id::uuid, $2::uuid, $1::uuid, m.student_id::uuid, m.status,
              m.score::numeric, m.note, $3::uuid, $4
         FROM unnest($5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
                AS m(id, student_id, status, score, note)
       ON CONFLICT (component_id, student_id) DO UPDATE
          SET status = EXCLUDED.status, score = EXCLUDED.score, note = EXCLUDED.note,
              marked_by = EXCLUDED.marked_by, marked_at = EXCLUDED.marked_at,
              updated_at = EXCLUDED.marked_at,
              version = assessment_marks.version + 1`,
      [
        input.componentId, input.tenantId, input.markedBy, input.at,
        input.marks.map((m) => m.id),
        input.marks.map((m) => m.studentId),
        input.marks.map((m) => m.status),
        input.marks.map((m) => (m.score === null ? null : String(m.score))),
        input.marks.map((m) => m.note),
      ],
    );
  }

  /**
   * One mark with the context a permission check needs. Resolved server-side,
   * because a client saying which cohort a mark belongs to would be a client
   * deciding its own authorization.
   */
  async findById(tx: Tx, id: string) {
    const { rows } = await clientOf(tx).query(
      `SELECT m.id, m.student_id, m.status, m.score, m.note, p.full_name AS marked_by_name,
              m.marked_at, m.version, m.component_id, c.offering_id, o.section_id
         FROM assessment_marks m
         JOIN assessment_components c ON c.id = m.component_id
         JOIN course_offerings o ON o.id = c.offering_id
         LEFT JOIN persons p ON p.id = m.marked_by
        WHERE m.id = $1`, [id],
    );
    if (!rows[0]) return null;
    return {
      ...toMark(rows[0]),
      componentId: rows[0].component_id as string,
      offeringId: rows[0].offering_id as string,
      sectionId: rows[0].section_id as string,
    };
  }

  async correct(tx: Tx, input: {
    id: string; tenantId: string; markId: string;
    fromStatus: MarkStatus; fromScore: number | null;
    toStatus: MarkStatus; toScore: number | null;
    reason: string; correctedBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO assessment_mark_corrections
         (id, tenant_id, mark_id, from_status, from_score, to_status, to_score, reason, corrected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [input.id, input.tenantId, input.markId, input.fromStatus, input.fromScore,
        input.toStatus, input.toScore, input.reason, input.correctedBy],
    );
  }

  async correctionsForComponent(tx: Tx, componentId: string): Promise<AssessmentCorrectionRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT k.id, k.mark_id, sp.full_name AS student_name,
              k.from_status, k.from_score, k.to_status, k.to_score, k.reason,
              cp.full_name AS corrected_by_name, k.corrected_at
         FROM assessment_mark_corrections k
         JOIN assessment_marks m ON m.id = k.mark_id
         JOIN students st ON st.id = m.student_id
         JOIN persons sp ON sp.id = st.person_id
         LEFT JOIN persons cp ON cp.id = k.corrected_by
        WHERE m.component_id = $1
        ORDER BY k.corrected_at DESC`, [componentId],
    );
    return rows.map((r) => ({
      id: r.id, markId: r.mark_id, studentName: r.student_name,
      fromStatus: r.from_status, fromScore: toNumber(r.from_score),
      toStatus: r.to_status, toScore: toNumber(r.to_score),
      reason: r.reason, correctedByName: r.corrected_by_name, correctedAt: r.corrected_at,
    }));
  }
}

/* ---------------------------------------------------------------- mapping -- */

/**
 * PostgreSQL sends `numeric` as text so that no precision is lost in transit.
 * Two decimal places survive a JavaScript number exactly enough to display and
 * compare; the database remains the authority on the stored value.
 */
function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function toComponent(r: any): ComponentRecord {
  return {
    id: r.id, offeringId: r.offering_id, name: r.name, kind: r.kind,
    maxMarks: Number(r.max_marks), weight: Number(r.weight),
    heldOn: r.held_on === null ? null : String(r.held_on),
    status: r.status,
    submittedAt: r.submitted_at, submittedByName: r.submitted_by_name,
    verifiedAt: r.verified_at, verifiedByName: r.verified_by_name,
    cancelledReason: r.cancelled_reason, version: r.version, markCount: r.mark_count,
    courseCode: r.course_code, courseTitle: r.course_title,
    sectionId: r.section_id, sectionLabel: r.section_label, programName: r.program_name,
    termId: r.term_id, termName: r.term_name, teacherName: r.teacher_name,
  };
}

function toMark(r: any): AssessmentMarkRecord {
  return {
    id: r.id, studentId: r.student_id, status: r.status, score: toNumber(r.score),
    note: r.note, markedByName: r.marked_by_name, markedAt: r.marked_at, version: r.version,
  };
}

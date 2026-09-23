import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  AttendanceState, CorrectionRecord, MarkRecord, MarkRepository, SheetRecord, SheetRepository,
  SheetSummary, StaffAttendanceRecord, StaffAttendanceRepository,
} from '../application/ports.ts';

const SHEET_SELECT = `
  SELECT sh.id, sh.session_id, sh.status, sh.submitted_at, sh.submitted_by,
         p.full_name AS submitted_by_name, sh.version
    FROM attendance_sheets sh
    LEFT JOIN persons p ON p.id = sh.submitted_by`;

export class PgSheetRepository implements SheetRepository {
  async findBySession(tx: Tx, sessionId: string): Promise<SheetRecord | null> {
    const { rows } = await clientOf(tx).query(
      `${SHEET_SELECT} WHERE sh.session_id = $1`, [sessionId],
    );
    return rows[0] ? toSheet(rows[0]) : null;
  }

  async create(tx: Tx, input: {
    id: string; tenantId: string; sessionId: string; createdBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO attendance_sheets (id, tenant_id, session_id, created_by)
       VALUES ($1,$2,$3,$4)`,
      [input.id, input.tenantId, input.sessionId, input.createdBy],
    );
  }

  async touch(tx: Tx, input: { id: string; expectedVersion: number }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE attendance_sheets SET updated_at = now(), version = version + 1
        WHERE id = $1 AND version = $2 AND status = 'draft'`,
      [input.id, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  async submit(tx: Tx, input: {
    id: string; by: string; at: Date; expectedVersion: number;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE attendance_sheets
          SET status = 'submitted', submitted_at = $3, submitted_by = $2,
              updated_at = $3, version = version + 1
        WHERE id = $1 AND version = $4 AND status = 'draft'`,
      [input.id, input.by, input.at, input.expectedVersion],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Counts per register for a set of classes, in one query.
   *
   * The overview spans a day or a week, and asking per session would be one
   * request per row of a screen.
   */
  async summariesFor(tx: Tx, sessionIds: readonly string[]): Promise<SheetSummary[]> {
    if (sessionIds.length === 0) return [];
    const { rows } = await clientOf(tx).query(
      `SELECT cs.id AS session_id, sh.id AS sheet_id,
              coalesce(sh.status, 'draft') AS status, sh.submitted_at,
              count(r.id) FILTER (WHERE r.state = 'present')::int AS present,
              count(r.id) FILTER (WHERE r.state = 'absent')::int  AS absent,
              count(r.id) FILTER (WHERE r.state = 'late')::int    AS late,
              count(r.id) FILTER (WHERE r.state = 'excused')::int AS excused,
              count(r.id)::int AS marked
         FROM class_sessions cs
         LEFT JOIN attendance_sheets sh ON sh.session_id = cs.id
         LEFT JOIN attendance_records r ON r.sheet_id = sh.id
        WHERE cs.id = ANY($1::uuid[])
        GROUP BY cs.id, sh.id, sh.status, sh.submitted_at`,
      [[...sessionIds]],
    );
    return rows.map((r) => ({
      sessionId: r.session_id, sheetId: r.sheet_id, status: r.status,
      present: r.present, absent: r.absent, late: r.late, excused: r.excused,
      marked: r.marked, submittedAt: r.submitted_at,
    }));
  }
}

/* ----------------------------------------------------------------- marks -- */

const MARK_SELECT = `
  SELECT r.id, r.student_id, r.state, r.note, r.marked_by, p.full_name AS marked_by_name,
         r.marked_at, r.version
    FROM attendance_records r
    LEFT JOIN persons p ON p.id = r.marked_by`;

export class PgMarkRepository implements MarkRepository {
  async listForSheet(tx: Tx, sheetId: string): Promise<MarkRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${MARK_SELECT} WHERE r.sheet_id = $1`, [sheetId],
    );
    return rows.map(toMark);
  }

  /**
   * One INSERT for the whole batch, with the conflict path updating.
   *
   * The triggers still fire per row, which is the point: each mark is checked
   * against enrolment on the class's own date, and the whole statement fails if
   * any one of them is wrong.
   */
  async upsertMany(tx: Tx, input: {
    sheetId: string; tenantId: string; markedBy: string; at: Date;
    marks: ReadonlyArray<{ id: string; studentId: string; state: AttendanceState; note: string | null }>;
  }): Promise<void> {
    if (input.marks.length === 0) return;
    await clientOf(tx).query(
      `INSERT INTO attendance_records
         (id, tenant_id, sheet_id, student_id, state, note, marked_by, marked_at)
       SELECT m.id::uuid, $2::uuid, $1::uuid, m.student_id::uuid, m.state, m.note, $3::uuid, $4
         FROM unnest($5::text[], $6::text[], $7::text[], $8::text[])
                AS m(id, student_id, state, note)
       ON CONFLICT (sheet_id, student_id) DO UPDATE
          SET state = EXCLUDED.state, note = EXCLUDED.note,
              marked_by = EXCLUDED.marked_by, marked_at = EXCLUDED.marked_at,
              updated_at = EXCLUDED.marked_at,
              version = attendance_records.version + 1`,
      [
        input.sheetId, input.tenantId, input.markedBy, input.at,
        input.marks.map((m) => m.id),
        input.marks.map((m) => m.studentId),
        input.marks.map((m) => m.state),
        input.marks.map((m) => m.note),
      ],
    );
  }

  /**
   * One mark with the context a permission check needs: which class it belongs
   * to, and which cohort that class is taught to. Resolved server-side, because
   * a client saying which section a mark belongs to is a client deciding its own
   * authorization.
   */
  async findById(tx: Tx, id: string) {
    const { rows } = await clientOf(tx).query(
      `SELECT r.id, r.student_id, r.state, r.note, r.marked_by,
              p.full_name AS marked_by_name, r.marked_at, r.version,
              r.sheet_id, sh.session_id, o.section_id, cs.offering_id
         FROM attendance_records r
         JOIN attendance_sheets sh ON sh.id = r.sheet_id
         JOIN class_sessions cs ON cs.id = sh.session_id
         JOIN course_offerings o ON o.id = cs.offering_id
         LEFT JOIN persons p ON p.id = r.marked_by
        WHERE r.id = $1`, [id],
    );
    if (!rows[0]) return null;
    return {
      ...toMark(rows[0]),
      sheetId: rows[0].sheet_id as string,
      sessionId: rows[0].session_id as string,
      sectionId: rows[0].section_id as string,
      offeringId: rows[0].offering_id as string,
    };
  }

  async correct(tx: Tx, input: {
    id: string; tenantId: string; recordId: string; fromState: AttendanceState;
    toState: AttendanceState; reason: string; correctedBy: string;
  }): Promise<void> {
    // Inserting the correction is what changes the mark: the trigger on this
    // table applies it. There is no separate update to forget.
    await clientOf(tx).query(
      `INSERT INTO attendance_corrections
         (id, tenant_id, record_id, from_state, to_state, reason, corrected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.recordId, input.fromState, input.toState,
        input.reason, input.correctedBy],
    );
  }

  async correctionsForSheet(tx: Tx, sheetId: string): Promise<CorrectionRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT c.id, c.record_id, r.student_id, sp.full_name AS student_name,
              c.from_state, c.to_state, c.reason, c.corrected_by,
              cp.full_name AS corrected_by_name, c.corrected_at
         FROM attendance_corrections c
         JOIN attendance_records r ON r.id = c.record_id
         JOIN students st ON st.id = r.student_id
         JOIN persons sp ON sp.id = st.person_id
         LEFT JOIN persons cp ON cp.id = c.corrected_by
        WHERE r.sheet_id = $1
        ORDER BY c.corrected_at DESC`, [sheetId],
    );
    return rows.map((r) => ({
      id: r.id, recordId: r.record_id, studentId: r.student_id, studentName: r.student_name,
      fromState: r.from_state, toState: r.to_state, reason: r.reason,
      correctedById: r.corrected_by, correctedByName: r.corrected_by_name,
      correctedAt: r.corrected_at,
    }));
  }
}

export class PgStaffAttendanceRepository implements StaffAttendanceRepository {
  async findByDate(tx: Tx, personId: string, workDate: string): Promise<StaffAttendanceRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, work_date, punch_in_at, punch_out_at FROM staff_attendance
        WHERE person_id = $1 AND work_date = $2`,
      [personId, workDate],
    );
    return rows[0] ? toStaffAttendance(rows[0]) : null;
  }

  async punchIn(tx: Tx, input: {
    id: string; tenantId: string; personId: string; workDate: string; at: Date;
  }): Promise<StaffAttendanceRecord> {
    const { rows } = await clientOf(tx).query(
      `INSERT INTO staff_attendance (id, tenant_id, person_id, work_date, punch_in_at)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, work_date, punch_in_at, punch_out_at`,
      [input.id, input.tenantId, input.personId, input.workDate, input.at],
    );
    return toStaffAttendance(rows[0]);
  }

  async punchOut(tx: Tx, input: { id: string; at: Date }): Promise<void> {
    await clientOf(tx).query(
      `UPDATE staff_attendance SET punch_out_at = $2 WHERE id = $1`,
      [input.id, input.at],
    );
  }

  async history(tx: Tx, personId: string, range: { from: string; to: string }): Promise<StaffAttendanceRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, work_date, punch_in_at, punch_out_at FROM staff_attendance
        WHERE person_id = $1 AND work_date BETWEEN $2 AND $3
        ORDER BY work_date DESC`,
      [personId, range.from, range.to],
    );
    return rows.map(toStaffAttendance);
  }
}

function toStaffAttendance(r: any): StaffAttendanceRecord {
  return {
    id: r.id,
    workDate: r.work_date instanceof Date ? r.work_date.toISOString().slice(0, 10) : r.work_date,
    punchInAt: r.punch_in_at, punchOutAt: r.punch_out_at,
  };
}

/* ---------------------------------------------------------------- mapping -- */

function toSheet(r: any): SheetRecord {
  return {
    id: r.id, sessionId: r.session_id, status: r.status,
    submittedAt: r.submitted_at, submittedById: r.submitted_by,
    submittedByName: r.submitted_by_name, version: r.version,
  };
}

function toMark(r: any): MarkRecord {
  return {
    id: r.id, studentId: r.student_id, state: r.state, note: r.note,
    markedById: r.marked_by, markedByName: r.marked_by_name,
    markedAt: r.marked_at, version: r.version,
  };
}

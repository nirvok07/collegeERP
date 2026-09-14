import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';

/** ST-1: the signed-in student, as their own app needs them. */
export interface StudentSelf {
  id: string;
  enrolmentNumber: string;
  status: string;
  programName: string;
  sectionLabel: string | null;
  sectionTermNumber: number | null;
}

/** One course's attendance, from submitted registers only. */
export interface CourseAttendance {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  component: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
}

/**
 * Reads for a student about themselves, keyed by the signed-in person and
 * never by anything the client sends, exactly as `/me/teaching` is for a
 * teacher. Runs inside the college's unit of work, so row-level security
 * confines it to that college.
 */
export class PgStudentSelfReader {
  async whoAmI(tx: Tx, personId: string): Promise<StudentSelf | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT s.id, s.enrolment_number, s.status, p.name AS program_name,
              sec.label AS section_label, sec.term_number AS section_term_number
         FROM students s
         JOIN programs p ON p.id = s.program_id
         LEFT JOIN section_memberships m ON m.student_id = s.id AND m.valid_to IS NULL
         LEFT JOIN sections sec ON sec.id = m.section_id
        WHERE s.person_id = $1
        LIMIT 1`,
      [personId],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id, enrolmentNumber: r.enrolment_number, status: r.status, programName: r.program_name,
          sectionLabel: r.section_label ?? null, sectionTermNumber: r.section_term_number ?? null,
        }
      : null;
  }

  /**
   * Only submitted registers count: a draft is a teacher's work in progress,
   * and a student must not see a mark that may still change.
   */
  async attendance(tx: Tx, personId: string): Promise<CourseAttendance[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT o.id AS offering_id, c.code AS course_code, c.title AS course_title, o.component,
              count(*) FILTER (WHERE r.state = 'present')::int AS present,
              count(*) FILTER (WHERE r.state = 'late')::int    AS late,
              count(*) FILTER (WHERE r.state = 'absent')::int  AS absent,
              count(*) FILTER (WHERE r.state = 'excused')::int AS excused,
              count(*)::int AS total
         FROM students s
         JOIN attendance_records r ON r.student_id = s.id
         JOIN attendance_sheets sh ON sh.id = r.sheet_id AND sh.status = 'submitted'
         JOIN class_sessions cs ON cs.id = sh.session_id
         JOIN course_offerings o ON o.id = cs.offering_id
         JOIN courses c ON c.id = o.course_id
        WHERE s.person_id = $1
        GROUP BY o.id, c.code, c.title, o.component
        ORDER BY c.code, o.component`,
      [personId],
    );
    return rows.map((r) => ({
      offeringId: r.offering_id, courseCode: r.course_code, courseTitle: r.course_title, component: r.component,
      present: r.present, late: r.late, absent: r.absent, excused: r.excused, total: r.total,
    }));
  }
}

/**
 * The share of classes attended: present and late count as attended; excused
 * absences (sanctioned duty leave) are left out of the count altogether.
 * Null when there is nothing to count yet.
 */
export function attendancePercent(a: { present: number; late: number; excused: number; total: number }): number | null {
  const counted = a.total - a.excused;
  return counted > 0 ? Math.round(((a.present + a.late) * 1000) / counted) / 10 : null;
}

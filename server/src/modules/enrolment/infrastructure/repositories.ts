import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  EnrolmentRepository, MembershipRecord, MembershipRepository, RosterEntry, StudentFilter,
  StudentRecord, StudentRepository, StudentStatus,
} from '../application/ports.ts';

/**
 * A student carries their person, their program and their current cohort in one
 * query. A roster screen that had to fetch names separately would either be slow
 * or would show identifiers, and neither is usable.
 */
const STUDENT_SELECT = `
  SELECT st.id, st.person_id, p.full_name, p.primary_email AS email, p.primary_phone AS phone,
         st.enrolment_number, st.program_id, pr.name AS program_name,
         st.admitted_on, st.status, st.status_reason,
         live.section_id, sec.label AS section_label, sec.term_number AS section_term_number
    FROM students st
    JOIN persons p ON p.id = st.person_id
    JOIN programs pr ON pr.id = st.program_id
    LEFT JOIN section_memberships live
           ON live.student_id = st.id AND live.valid_to IS NULL
    LEFT JOIN sections sec ON sec.id = live.section_id`;

export class PgStudentRepository implements StudentRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; personId: string; enrolmentNumber: string;
    programId: string; admittedOn: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO students
         (id, tenant_id, person_id, enrolment_number, program_id, admitted_on)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.tenantId, input.personId, input.enrolmentNumber,
        input.programId, input.admittedOn],
    );
  }

  async findById(tx: Tx, id: string): Promise<StudentRecord | null> {
    const { rows } = await clientOf(tx).query(`${STUDENT_SELECT} WHERE st.id = $1`, [id]);
    return rows[0] ? toStudent(rows[0]) : null;
  }

  async list(tx: Tx, filter: StudentFilter): Promise<StudentRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (clause: (n: number) => string, value: unknown) => {
      values.push(value);
      where.push(clause(values.length));
    };

    if (filter.search) {
      add((n) => `(p.full_name ILIKE $${n} OR st.enrolment_number ILIKE $${n})`,
        `%${filter.search}%`);
    }
    if (filter.programId) add((n) => `st.program_id = $${n}`, filter.programId);
    if (filter.status) add((n) => `st.status = $${n}`, filter.status);
    if (filter.sectionId) add((n) => `live.section_id = $${n}`, filter.sectionId);
    // The queue an operator works from at the start of a term.
    if (filter.unplacedOnly) where.push(`live.section_id IS NULL`);

    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 500) : 500;
    const { rows } = await clientOf(tx).query(
      `${STUDENT_SELECT}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY st.enrolment_number
        LIMIT ${limit}`, values,
    );
    return rows.map(toStudent);
  }

  async setStatus(tx: Tx, input: {
    id: string; status: StudentStatus; reason: string | null;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE students SET status = $2, status_reason = $3,
              updated_at = now(), version = version + 1
        WHERE id = $1 AND status <> $2`,
      [input.id, input.status, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }
}

/* ----------------------------------------------------------- memberships -- */

const MEMBERSHIP_SELECT = `
  SELECT id, student_id, section_id, valid_from, valid_to, end_reason
    FROM section_memberships`;

export class PgMembershipRepository implements MembershipRepository {
  async place(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; sectionId: string;
    from: string; placedBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO section_memberships
         (id, tenant_id, student_id, section_id, valid_from, placed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.tenantId, input.studentId, input.sectionId, input.from, input.placedBy],
    );
  }

  async findLive(tx: Tx, studentId: string, sectionId: string): Promise<MembershipRecord | null> {
    const { rows } = await clientOf(tx).query(
      `${MEMBERSHIP_SELECT} WHERE student_id = $1 AND section_id = $2 AND valid_to IS NULL`,
      [studentId, sectionId],
    );
    return rows[0] ? toMembership(rows[0]) : null;
  }

  async end(tx: Tx, input: {
    id: string; on: string; endedBy: string; reason: string;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE section_memberships
          SET valid_to = $2, ended_by = $3, end_reason = $4
        WHERE id = $1 AND valid_to IS NULL`,
      [input.id, input.on, input.endedBy, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }

  async liveMemberIds(tx: Tx, sectionId: string): Promise<string[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT student_id FROM section_memberships
        WHERE section_id = $1 AND valid_to IS NULL`, [sectionId],
    );
    return rows.map((r) => r.student_id as string);
  }

  async historyFor(tx: Tx, studentId: string): Promise<MembershipRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${MEMBERSHIP_SELECT} WHERE student_id = $1 ORDER BY valid_from DESC`, [studentId],
    );
    return rows.map(toMembership);
  }
}

/* ------------------------------------------------------------ enrolments -- */

export class PgEnrolmentRepository implements EnrolmentRepository {
  async enrol(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; offeringId: string;
    from: string; enrolledBy: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO offering_enrolments
         (id, tenant_id, student_id, offering_id, valid_from, enrolled_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.tenantId, input.studentId, input.offeringId,
        input.from, input.enrolledBy],
    );
  }

  async findLive(
    tx: Tx, studentId: string, offeringId: string,
  ): Promise<{ id: string; validFrom: string } | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, valid_from FROM offering_enrolments
        WHERE student_id = $1 AND offering_id = $2 AND valid_to IS NULL`,
      [studentId, offeringId],
    );
    return rows[0] ? { id: rows[0].id, validFrom: String(rows[0].valid_from) } : null;
  }

  async end(tx: Tx, input: {
    id: string; on: string; endedBy: string; reason: string;
  }): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE offering_enrolments
          SET valid_to = $2, ended_by = $3, end_reason = $4
        WHERE id = $1 AND valid_to IS NULL`,
      [input.id, input.on, input.endedBy, input.reason],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Half-open on neither side: an enrolment covers a date when it started on or
   * before it and had not ended before it. Dates, so no timezone can move a
   * student in or out of a class.
   */
  async rosterAsOf(tx: Tx, offeringId: string, onDate: string): Promise<RosterEntry[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT st.id AS student_id, st.person_id, p.full_name, st.enrolment_number,
              st.status AS student_status, e.valid_from, e.valid_to
         FROM offering_enrolments e
         JOIN students st ON st.id = e.student_id
         JOIN persons p ON p.id = st.person_id
        WHERE e.offering_id = $1
          AND e.valid_from <= $2
          AND (e.valid_to IS NULL OR e.valid_to >= $2)
        ORDER BY st.enrolment_number`,
      [offeringId, onDate],
    );
    return rows.map((r) => ({
      studentId: r.student_id, personId: r.person_id, fullName: r.full_name,
      enrolmentNumber: r.enrolment_number, studentStatus: r.student_status,
      enrolledFrom: String(r.valid_from),
      enrolledTo: r.valid_to === null ? null : String(r.valid_to),
    }));
  }

  async liveForStudentInSection(
    tx: Tx, studentId: string, sectionId: string,
  ): Promise<Array<{ id: string; offeringId: string }>> {
    const { rows } = await clientOf(tx).query(
      `SELECT e.id, e.offering_id
         FROM offering_enrolments e
         JOIN course_offerings o ON o.id = e.offering_id
        WHERE e.student_id = $1 AND o.section_id = $2 AND e.valid_to IS NULL`,
      [studentId, sectionId],
    );
    return rows.map((r) => ({ id: r.id, offeringId: r.offering_id }));
  }

  async liveStudentIds(tx: Tx, offeringId: string): Promise<string[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT student_id FROM offering_enrolments
        WHERE offering_id = $1 AND valid_to IS NULL`, [offeringId],
    );
    return rows.map((r) => r.student_id as string);
  }
}

/* ------------------------------------------------------------------ mapping */

function toStudent(r: any): StudentRecord {
  return {
    id: r.id, personId: r.person_id, fullName: r.full_name, email: r.email, phone: r.phone,
    enrolmentNumber: r.enrolment_number, programId: r.program_id,
    programName: r.program_name, admittedOn: String(r.admitted_on),
    status: r.status, statusReason: r.status_reason,
    sectionId: r.section_id, sectionLabel: r.section_label,
    sectionTermNumber: r.section_term_number,
  };
}

function toMembership(r: any): MembershipRecord {
  return {
    id: r.id, studentId: r.student_id, sectionId: r.section_id,
    validFrom: String(r.valid_from),
    validTo: r.valid_to === null ? null : String(r.valid_to),
    endReason: r.end_reason,
  };
}

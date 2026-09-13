import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';

/** ADM-1: the College Admin dashboard's numbers, for one college. */
export interface CollegeOverview {
  staff: number;
  students: number;
  departments: number;
  programs: number;
  sections: number;
  offerings: number;
  rooms: number;
  pendingInvitations: number;
}

/**
 * A read model, counts only, across the college's own tables. It runs inside
 * the college's unit of work, so row-level security (AD-22) confines every
 * count to that college; nothing here can see another.
 */
export class PgCollegeOverviewReader {
  async read(tx: Tx): Promise<CollegeOverview> {
    const { rows } = await clientOf(tx).query(`
      SELECT
        (SELECT count(*) FROM persons
          WHERE person_type = 'staff' AND deleted_at IS NULL AND merged_into_id IS NULL)::int AS staff,
        (SELECT count(*) FROM students WHERE status = 'enrolled')::int AS students,
        (SELECT count(*) FROM departments WHERE status = 'active')::int AS departments,
        (SELECT count(*) FROM programs WHERE status = 'active')::int AS programs,
        (SELECT count(*) FROM sections WHERE status IN ('planned', 'open', 'active'))::int AS sections,
        (SELECT count(*) FROM course_offerings WHERE status IN ('planned', 'active'))::int AS offerings,
        (SELECT count(*) FROM rooms WHERE status = 'active')::int AS rooms,
        (SELECT count(*) FROM user_accounts WHERE status = 'invited')::int AS pending_invitations`);
    const r = rows[0];
    return {
      staff: r.staff,
      students: r.students,
      departments: r.departments,
      programs: r.programs,
      sections: r.sections,
      offerings: r.offerings,
      rooms: r.rooms,
      pendingInvitations: r.pending_invitations,
    };
  }
}

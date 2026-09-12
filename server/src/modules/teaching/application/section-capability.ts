/**
 * M3's declared capability for other modules.
 *
 * Same shape as M1's scope occupancy under AD-28: a function, not shared table
 * access. A module asking "is anyone in this section" must not interpret
 * enrolment for itself.
 *
 * Enrolment belongs to M5 and does not exist yet, so occupancy is zero today.
 * The capability exists now so that the cancellation rule has one place to live
 * when it does, rather than being retrofitted into a state machine later.
 */
import type { Tx } from '../../../shared/application/unit-of-work.ts';

export interface SectionOccupancy {
  enrolled: number;
}

export async function occupancyOfSection(_tx: Tx, _sectionId: string): Promise<SectionOccupancy> {
  // M5 will replace this with a count over enrolments. Returning zero is
  // correct rather than a placeholder: no student can be enrolled in anything
  // until enrolment exists.
  return { enrolled: 0 };
}

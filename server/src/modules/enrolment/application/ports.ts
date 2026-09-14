import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type StudentStatus = 'enrolled' | 'on_leave' | 'withdrawn' | 'graduated';

export interface StudentRecord {
  id: string;
  personId: string;
  fullName: string;
  email: string | null;
  /** Where their sign-in code can go (AD-82). */
  phone: string | null;
  enrolmentNumber: string;
  programId: string;
  programName: string;
  admittedOn: string;
  status: StudentStatus;
  statusReason: string | null;
  /** The cohort they are in now, if any. */
  sectionId: string | null;
  sectionLabel: string | null;
  sectionTermNumber: number | null;
}

export interface StudentFilter {
  search?: string | null;
  programId?: string | null;
  sectionId?: string | null;
  status?: StudentStatus | null;
  /** Students with no live cohort placement: the queue an operator works from. */
  unplacedOnly?: boolean;
  limit?: number | null;
}

export interface StudentRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; personId: string; enrolmentNumber: string;
    programId: string; admittedOn: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<StudentRecord | null>;
  list(tx: Tx, filter: StudentFilter): Promise<StudentRecord[]>;
  setStatus(tx: Tx, input: {
    id: string; status: StudentStatus; reason: string | null;
  }): Promise<boolean>;
}

export interface MembershipRecord {
  id: string;
  studentId: string;
  sectionId: string;
  validFrom: string;
  validTo: string | null;
  endReason: string | null;
}

export interface MembershipRepository {
  place(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; sectionId: string;
    from: string; placedBy: string;
  }): Promise<void>;
  findLive(tx: Tx, studentId: string, sectionId: string): Promise<MembershipRecord | null>;
  end(tx: Tx, input: {
    id: string; on: string; endedBy: string; reason: string;
  }): Promise<boolean>;
  /** Live members of a cohort, for enrolling them into a newly added course. */
  liveMemberIds(tx: Tx, sectionId: string): Promise<string[]>;
  historyFor(tx: Tx, studentId: string): Promise<MembershipRecord[]>;
}

/** One student on an offering's roster, as the roster stood on a given date. */
export interface RosterEntry {
  studentId: string;
  personId: string;
  fullName: string;
  enrolmentNumber: string;
  studentStatus: StudentStatus;
  enrolledFrom: string;
  enrolledTo: string | null;
}

export interface EnrolmentRepository {
  enrol(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; offeringId: string;
    from: string; enrolledBy: string;
  }): Promise<void>;
  findLive(tx: Tx, studentId: string, offeringId: string):
    Promise<{ id: string; validFrom: string } | null>;
  end(tx: Tx, input: {
    id: string; on: string; endedBy: string; reason: string;
  }): Promise<boolean>;
  /**
   * The roster of an offering **as of a date**, which is the only correct way to
   * ask. A student who withdrew in week ten was still expected in week three,
   * and reopening week three's sheet must show them.
   */
  rosterAsOf(tx: Tx, offeringId: string, onDate: string): Promise<RosterEntry[]>;
  /** Live enrolments a student holds in one section's offerings. */
  liveForStudentInSection(tx: Tx, studentId: string, sectionId: string):
    Promise<Array<{ id: string; offeringId: string }>>;
  liveStudentIds(tx: Tx, offeringId: string): Promise<string[]>;
}

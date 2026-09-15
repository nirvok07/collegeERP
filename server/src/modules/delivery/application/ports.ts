import type { Tx } from '../../../shared/application/unit-of-work.ts';

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
export type RoomKind = 'classroom' | 'lab' | 'seminar' | 'auditorium';

/* -------------------------------------------------------------------- rooms */

export interface RoomRecord {
  id: string;
  campusId: string;
  campusName: string;
  code: string;
  name: string;
  kind: RoomKind;
  capacity: number | null;
  status: 'active' | 'archived';
  /** Live timetable slots holding this room, so archiving can explain itself. */
  slotCount: number;
}

export interface RoomRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; campusId: string; code: string; name: string;
    kind: RoomKind; capacity: number | null;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<RoomRecord | null>;
  list(tx: Tx, filter: { campusId?: string | null; includeArchived?: boolean }): Promise<RoomRecord[]>;
  update(tx: Tx, input: {
    id: string; name: string; kind: RoomKind; capacity: number | null;
  }): Promise<boolean>;
  archive(tx: Tx, id: string): Promise<boolean>;
}

/* ------------------------------------------------------- non-teaching days */

export interface NonTeachingDayRecord {
  id: string;
  onDate: string;
  label: string;
}

export interface NonTeachingDayRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; onDate: string; label: string; createdBy: string;
  }): Promise<void>;
  list(tx: Tx, range: { from?: string | null; to?: string | null }): Promise<NonTeachingDayRecord[]>;
  /** Removed rather than archived: nothing references a holiday. */
  remove(tx: Tx, id: string): Promise<boolean>;
  /** CAL-1: the years and terms that overlap the range, archived ones left out. */
  periods(tx: Tx, range: { from?: string | null; to?: string | null }): Promise<CalendarPeriod[]>;
}

/** CAL-1: an academic year or a term, as the calendar shows it. */
export interface CalendarPeriod {
  kind: 'year' | 'term';
  id: string;
  name: string;
  /** The year a term belongs to; null for a year. */
  yearName: string | null;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

/* --------------------------------------------------------- timetable slots */

export interface SlotRecord {
  id: string;
  offeringId: string;
  /** ISO-8601: 1 is Monday, 7 is Sunday, matching PostgreSQL's isodow. */
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  roomCode: string | null;
  roomName: string | null;
  courseCode: string;
  courseTitle: string;
  component: string;
  sectionId: string;
  sectionLabel: string;
  programName: string;
  termId: string;
  termName: string;
}

export interface SlotRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; dayOfWeek: number;
    startsAt: string; endsAt: string; roomId: string | null; createdBy: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<SlotRecord | null>;
  list(tx: Tx, filter: { offeringId?: string | null; termId?: string | null }): Promise<SlotRecord[]>;
  remove(tx: Tx, id: string): Promise<boolean>;
}

/* ---------------------------------------------------------- class sessions */

export interface SessionRecord {
  id: string;
  offeringId: string;
  slotId: string | null;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  roomId: string | null;
  roomCode: string | null;
  roomName: string | null;
  campusName: string | null;
  roomCapacity: number | null;
  /** Set only when somebody stands in for the offering's lead. */
  substituteId: string | null;
  /** Who actually teaches it: the stand-in, or the offering's live lead. */
  teacherId: string | null;
  teacherName: string | null;
  cancelledReason: string | null;
  rescheduledFromDate: string | null;
  rescheduledFromStartsAt: string | null;
  completedAt: Date | null;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  component: string;
  sectionId: string;
  sectionLabel: string;
  sectionCapacity: number | null;
  termNumber: number;
  programId: string;
  programName: string;
  departmentName: string;
  termId: string;
  termName: string;
  academicYearName: string;
}

export interface SessionFilter {
  from?: string | null;
  to?: string | null;
  termId?: string | null;
  offeringId?: string | null;
  sectionId?: string | null;
  programId?: string | null;
  roomId?: string | null;
  /** Matches the effective teacher: the stand-in, or the offering's lead. */
  teacherId?: string | null;
  /**
   * The self feed. Wider than `teacherId` on purpose: a co-instructor is not
   * the effective teacher of a class but is certainly entitled to see it.
   */
  minePersonId?: string | null;
  status?: SessionStatus | null;
  /** Still scheduled with its date already past: nobody said whether it ran. */
  unmarkedOnly?: boolean;
  limit?: number | null;
}

/** One clash, in the terms an operator needs to fix it. */
export interface Clash {
  kind: 'room' | 'instructor';
  sessionDate: string;
  startsAt: string;
  /** What is already there. */
  withCourseCode: string;
  withSectionLabel: string;
  subject: string;
}

export interface SessionRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; offeringId: string; slotId: string | null;
    sessionDate: string; startsAt: string; endsAt: string; roomId: string | null;
    substituteId: string | null; createdBy: string;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<SessionRecord | null>;
  list(tx: Tx, filter: SessionFilter): Promise<SessionRecord[]>;
  /**
   * Occurrences this offering already has in a window, so generation can be run
   * twice without creating anything the second time. Keyed on date and start
   * time, because one day can carry a lecture and a lab.
   */
  existingOccurrences(tx: Tx, offeringId: string, from: string, to: string):
    Promise<Array<{ date: string; startsAt: string }>>;
  reschedule(tx: Tx, input: {
    id: string; sessionDate: string; startsAt: string; endsAt: string;
    roomId: string | null; fromDate: string; fromStartsAt: string;
  }): Promise<boolean>;
  cancel(tx: Tx, input: { id: string; reason: string; at: Date }): Promise<boolean>;
  complete(tx: Tx, input: { id: string; by: string; at: Date }): Promise<boolean>;
  reassign(tx: Tx, input: {
    id: string; roomId: string | null; substituteId: string | null;
  }): Promise<boolean>;
  /**
   * Room and instructor collisions for a set of proposed occurrences, found in
   * one query so a preview can be honest before anything is written.
   */
  clashesFor(tx: Tx, input: {
    offeringId: string;
    occurrences: Array<{ date: string; startsAt: string; endsAt: string; roomId: string | null }>;
  }): Promise<Clash[]>;
}

/* ------------------------------------------------------------------- reach */

/**
 * Whether this person's teaching actually reaches an offering (AD-40).
 *
 * The permission says they may record teaching; this says which teaching. It is
 * read from M3's authoritative assignment, never from anything the client sends,
 * and a stand-in on the session itself counts as reach for that session alone.
 */
export interface TeachingReachReader {
  leadsOffering(tx: Tx, offeringId: string, personId: string): Promise<boolean>;
  teachesOffering(tx: Tx, offeringId: string, personId: string): Promise<boolean>;
}

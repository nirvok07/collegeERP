/**
 * M6 Attendance: what was recorded about one class session.
 *
 * Two states, draft and submitted, and no unlock. Changing a submitted mark is a
 * correction that records the old state, the new state, who changed it and why.
 * An unlock is an invitation to edit history quietly; a correction is a
 * statement that history was wrong. Only one of those is auditable.
 *
 * See docs/blueprint/modules/m5-m6-attendance.md.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail, type Failure } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  SessionRecord, SessionRepository, TeachingReachReader,
} from '../../delivery/application/ports.ts';
import { recordTaughtWithin } from '../../delivery/application/manage-sessions.ts';
import type { EnrolmentRepository, RosterEntry } from '../../enrolment/application/ports.ts';
import type {
  AttendanceState, CorrectionRecord, MarkRecord, MarkRepository, SheetRecord, SheetRepository,
  SheetSummary,
} from './ports.ts';

export interface AttendanceActor {
  tenantId: string;
  personId: string;
}

export interface AttendanceDeps {
  uow: UnitOfWork;
  sheets: SheetRepository;
  marks: MarkRepository;
  sessions: SessionRepository;
  enrolments: EnrolmentRepository;
  reach: TeachingReachReader;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/**
 * How the caller is acting, which is AD-40 in one parameter.
 *
 * `administer` means they hold the permission institution-wide and may record a
 * register for somebody else: a coordinator entering a paper sheet. `teach`
 * means their reach must be checked against M3's assignments. The permission and
 * its scope are decided at the route; which classes it reaches is decided here.
 */
export type ActingAs = 'administer' | 'teach';

/** A register as a reader needs it: the class, the roster, and every mark on it. */
export interface SheetView {
  session: SessionRecord;
  sheet: SheetRecord | null;
  students: Array<RosterEntry & { mark: MarkRecord | null }>;
  corrections: CorrectionRecord[];
}

export function readSheet(
  deps: AttendanceDeps, actor: AttendanceActor, sessionId: string,
): Promise<SheetView | null> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const session = await deps.sessions.findById(tx, sessionId);
    if (!session) return null;

    // The roster is resolved as of the CLASS's date, never today, so reopening
    // an old register shows exactly who was expected in that room (AD-50).
    const roster = await deps.enrolments.rosterAsOf(tx, session.offeringId, session.sessionDate);
    const sheet = await deps.sheets.findBySession(tx, sessionId);

    const marks = sheet ? await deps.marks.listForSheet(tx, sheet.id) : [];
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));

    return {
      session,
      sheet,
      students: roster.map((entry) => ({ ...entry, mark: byStudent.get(entry.studentId) ?? null })),
      corrections: sheet ? await deps.marks.correctionsForSheet(tx, sheet.id) : [],
    };
  });
}

/**
 * The classes an overview covers. Delegates to M4's session list rather than
 * querying its table, so there is one definition of what a class is.
 */
export function listSessionsForAttendance(
  deps: AttendanceDeps,
  actor: AttendanceActor,
  window: { from: string; to: string; sectionId: string | null },
): Promise<SessionRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sessions.list(tx, {
    from: window.from,
    to: window.to,
    sectionId: window.sectionId,
    // A cancelled class has no register to keep, so it is not something an
    // operator has to chase.
    status: null,
  }));
}

export function summariesFor(
  deps: AttendanceDeps, actor: AttendanceActor, sessionIds: readonly string[],
): Promise<SheetSummary[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sheets.summariesFor(tx, sessionIds));
}

/**
 * Records a batch of marks.
 *
 * One transaction, one version bump: fifty marks either all land or none do, and
 * a classroom of sixty never becomes sixty requests. The version the client read
 * must still be current, so two teachers on one register cannot silently
 * overwrite each other.
 */
export async function markAttendance(
  deps: AttendanceDeps,
  actor: AttendanceActor,
  input: {
    sessionId: string;
    version: number;
    marks: ReadonlyArray<{ studentId: string; state: AttendanceState; note?: string | null }>;
    actingAs: ActingAs;
  },
): Promise<Result<{ version: number; marked: number }>> {
  if (input.marks.length === 0) {
    return Err(fail('VALIDATION_FAILED', 'Nothing to record.', {
      fieldErrors: { marks: 'At least one student' },
    }));
  }

  const at = deps.clock.now();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const session = await deps.sessions.findById(tx, input.sessionId);
      if (!session) return Err(fail('NOT_FOUND', 'That class was not found.'));
      if (session.status === 'cancelled') {
        return Err(fail('CONFLICT',
          'That class was cancelled, so there is no attendance to record.'));
      }
      // A register for next Tuesday is not a record of anything. Checked here
      // rather than in a trigger, because "today" belongs to the application
      // clock and not to whatever timezone the database runs in.
      if (session.sessionDate > at.toISOString().slice(0, 10)) {
        return Err(fail('CONFLICT',
          `That class is on ${session.sessionDate}. Attendance is recorded on the day, not before.`));
      }

      const denied = await outOfReach(deps, actor, tx, input.actingAs, session);
      if (denied) return Err(denied);

      let sheet = await deps.sheets.findBySession(tx, input.sessionId);
      // What the client must send next. Creating a register leaves it at its
      // own initial version; amending one bumps past the version just claimed.
      let nextVersion: number;

      // The sheet is created by the first mark rather than by scheduling, so a
      // term of classes does not carry a term of empty registers.
      if (!sheet) {
        if (input.version !== 0) {
          return Err(fail('CONFLICT',
            'This register was reset while you were marking it. Open it again.'));
        }
        const id = deps.ids.next();
        await deps.sheets.create(tx, {
          id, tenantId: actor.tenantId, sessionId: input.sessionId, createdBy: actor.personId,
        });
        sheet = await deps.sheets.findBySession(tx, input.sessionId);
        if (!sheet) return Err(fail('UNKNOWN', 'That register could not be opened.'));
        nextVersion = sheet.version;
      } else {
        if (sheet.status === 'submitted') {
          return Err(fail('CONFLICT',
            'This register has been submitted. Change a mark with a correction, which is recorded.'));
        }
        if (sheet.version !== input.version) {
          return Err(fail('CONFLICT',
            'Somebody else changed this register while you were marking it. Open it again so their marks are not lost.'));
        }
        const claimed = await deps.sheets.touch(tx, {
          id: sheet.id, expectedVersion: input.version,
        });
        if (!claimed) {
          return Err(fail('CONFLICT',
            'Somebody else changed this register just now. Open it again.'));
        }
        nextVersion = input.version + 1;
      }

      await deps.marks.upsertMany(tx, {
        sheetId: sheet.id, tenantId: actor.tenantId, markedBy: actor.personId, at,
        marks: input.marks.map((m) => ({
          id: deps.ids.next(), studentId: m.studentId, state: m.state,
          note: m.note?.trim() || null,
        })),
      });

      // One audit entry for the batch, with the shape of what was recorded.
      // Individual marks carry their own marked_by and marked_at, so nothing is
      // unattributable, and a row per student would bury the register itself.
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'attendance.marked', subjectType: 'attendance_sheet', subjectId: sheet.id,
        scopeType: 'section', scopeRefId: session.sectionId,
        after: {
          course: session.courseCode, section: session.sectionLabel,
          date: session.sessionDate, marked: input.marks.length,
          recordedBy: input.actingAs, counts: countStates(input.marks),
        },
      }, tx);

      return Ok({ version: nextVersion, marked: input.marks.length });
    });
  } catch (e) {
    return Err(translate(e, 'That register could not be recorded.'));
  }
}

/**
 * Submits a register: the teacher's statement of what happened in that room.
 *
 * Marks become read-only, and a class still only scheduled is recorded as taught
 * in the same transaction, because submitting a register is evidence that the
 * class happened. That write belongs to M4 and is performed through its own
 * function rather than by reaching into its table.
 */
export async function submitSheet(
  deps: AttendanceDeps,
  actor: AttendanceActor,
  input: { sessionId: string; version: number; actingAs: ActingAs },
): Promise<Result<{ submitted: true; unmarked: number }>> {
  const at = deps.clock.now();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const session = await deps.sessions.findById(tx, input.sessionId);
      if (!session) return Err(fail('NOT_FOUND', 'That class was not found.'));

      const denied = await outOfReach(deps, actor, tx, input.actingAs, session);
      if (denied) return Err(denied);

      const sheet = await deps.sheets.findBySession(tx, input.sessionId);
      if (!sheet) {
        return Err(fail('CONFLICT', 'Nothing has been marked on this register yet.'));
      }
      if (sheet.status === 'submitted') {
        return Err(fail('CONFLICT', 'This register has already been submitted.'));
      }
      if (sheet.version !== input.version) {
        return Err(fail('CONFLICT',
          'Somebody else changed this register while you were reviewing it. Open it again.'));
      }

      // Every enrolled student must have a state. A register with gaps is not a
      // statement about the class; it is an unfinished one.
      const roster = await deps.enrolments.rosterAsOf(tx, session.offeringId, session.sessionDate);
      const marks = await deps.marks.listForSheet(tx, sheet.id);
      const marked = new Set(marks.map((m) => m.studentId));
      const unmarked = roster.filter((r) => !marked.has(r.studentId));
      if (unmarked.length > 0) {
        return Err(fail('CONFLICT',
          `${unmarked.length} ${unmarked.length === 1 ? 'student has' : 'students have'} no mark yet. Every student needs one before you submit.`));
      }

      const submitted = await deps.sheets.submit(tx, {
        id: sheet.id, by: actor.personId, at, expectedVersion: input.version,
      });
      if (!submitted) {
        return Err(fail('CONFLICT', 'That register was changed by someone else just now.'));
      }

      // Submitting a register is evidence the class happened. M4 owns that
      // write and performs it; this only asks for the two records to agree.
      const nowTaught = await recordTaughtWithin(deps, tx, {
        sessionId: input.sessionId, by: actor.personId, at,
      });
      if (nowTaught) {
        await deps.audit.record({
          correlationId: deps.ids.next(), tenantId: actor.tenantId,
          actorType: 'person', actorId: actor.personId,
          action: 'session.completed', subjectType: 'class_session', subjectId: input.sessionId,
          scopeType: 'section', scopeRefId: session.sectionId,
          before: { status: 'scheduled' },
          after: { status: 'completed', course: session.courseCode, date: session.sessionDate },
          reason: 'Its attendance register was submitted',
        }, tx);
      }

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'attendance.submitted', subjectType: 'attendance_sheet', subjectId: sheet.id,
        scopeType: 'section', scopeRefId: session.sectionId,
        before: { status: 'draft' },
        after: {
          status: 'submitted', course: session.courseCode, section: session.sectionLabel,
          date: session.sessionDate, students: roster.length,
          counts: countStates(marks), recordedBy: input.actingAs,
          classRecordedAsTaught: nowTaught,
        },
      }, tx);

      return Ok({ submitted: true as const, unmarked: 0 });
    });
  } catch (e) {
    return Err(translate(e, 'That register could not be submitted.'));
  }
}

/**
 * Corrects one mark on a submitted register.
 *
 * The correction row is the mechanism, not a note about one: inserting it is
 * what changes the mark. The reason is required because a changed mark with no
 * stated cause is exactly what makes an attendance record untrustworthy.
 */
export async function correctMark(
  deps: AttendanceDeps,
  actor: AttendanceActor,
  input: { recordId: string; toState: AttendanceState; reason: string },
): Promise<Result<{ from: AttendanceState; to: AttendanceState }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. A changed mark needs one.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const mark = await deps.marks.findById(tx, input.recordId);
      if (!mark) return Err(fail('NOT_FOUND', 'That mark was not found.'));
      if (mark.state === input.toState) {
        return Err(fail('CONFLICT', `That mark is already ${input.toState}.`));
      }

      await deps.marks.correct(tx, {
        id: deps.ids.next(), tenantId: actor.tenantId, recordId: input.recordId,
        fromState: mark.state, toState: input.toState,
        reason: input.reason.trim(), correctedBy: actor.personId,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'attendance.corrected', subjectType: 'attendance_record',
        subjectId: input.recordId,
        scopeType: 'section', scopeRefId: mark.sectionId,
        before: { state: mark.state },
        after: { state: input.toState, studentId: mark.studentId, sessionId: mark.sessionId },
        reason: input.reason.trim(),
      }, tx);

      return Ok({ from: mark.state, to: input.toState });
    });
  } catch (e) {
    return Err(translate(e, 'That mark could not be corrected.'));
  }
}

/**
 * AD-40, in the one place it belongs.
 *
 * The permission said this person may record attendance. This says whether their
 * teaching reaches this class: a live instructor assignment on the offering, or
 * standing in for this one session. Nothing here reads an identifier the client
 * supplied.
 */
async function outOfReach(
  deps: AttendanceDeps,
  actor: AttendanceActor,
  tx: Tx,
  actingAs: ActingAs,
  session: SessionRecord,
): Promise<Failure | null> {
  if (actingAs === 'administer') return null;
  // Standing in for this one class is reach for this one class, which is the
  // whole point of recording a substitution as data rather than as a note.
  if (session.substituteId === actor.personId) return null;
  const assigned = await deps.reach.teachesOffering(tx, session.offeringId, actor.personId);
  if (assigned) return null;
  // Not "forbidden because of who you are": forbidden because nobody has
  // assigned you this teaching. Reach, not identity.
  return fail('FORBIDDEN',
    'You are not assigned to teach this course, so you cannot record its attendance.');
}

const countStates = (
  marks: ReadonlyArray<{ state: AttendanceState }>,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const mark of marks) counts[mark.state] = (counts[mark.state] ?? 0) + 1;
  return counts;
};

/**
 * Database refusals reach the user as the database wrote them. The triggers
 * state which student was not enrolled, or that a register has been submitted,
 * and replacing that with generic copy would throw away the actionable part.
 */
function translate(e: unknown, fallback: string) {
  if (e instanceof AppException) return fail(e.code, e.message || fallback);
  throw e;
}

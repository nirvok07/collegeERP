/**
 * The class session lifecycle: scheduled, then taught or cancelled.
 *
 * `completed` means the teaching occurred, recorded by somebody, never inferred
 * from the clock. A class on the timetable is not evidence that a class
 * happened, and the difference is what every later attendance and engagement
 * report depends on.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { OfferingRepository } from '../../teaching/application/ports.ts';
import type {
  SessionFilter, SessionRecord, SessionRepository, TeachingReachReader,
} from './ports.ts';
import type { DeliveryActor } from './manage-rooms.ts';

export interface SessionDeps {
  uow: UnitOfWork;
  sessions: SessionRepository;
  offerings: OfferingRepository;
  reach: TeachingReachReader;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/**
 * How the caller is acting, which is the whole of AD-40 in one parameter.
 *
 * `schedule` means they hold `session.manage` and act administratively.
 * `teach` means they hold `session.deliver` and their reach must be checked
 * against M3's assignments. The permission is decided at the route; which
 * classes it reaches is decided here, once.
 */
export type ActingAs = 'schedule' | 'teach';

export function listSessions(
  deps: SessionDeps, actor: DeliveryActor, filter: SessionFilter,
): Promise<SessionRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sessions.list(tx, filter));
}

export function readSession(
  deps: SessionDeps, actor: DeliveryActor, id: string,
): Promise<SessionRecord | null> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sessions.findById(tx, id));
}

/**
 * The signed-in person's own classes.
 *
 * Derived entirely from their id, never from anything the client sends, which is
 * the whole point of a separate endpoint rather than a filter a caller could
 * widen. Mirrors `GET /v1/me/teaching`.
 */
export function mySessions(
  deps: SessionDeps,
  actor: DeliveryActor,
  window: { from?: string | null; to?: string | null },
): Promise<SessionRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.sessions.list(tx, {
    minePersonId: actor.personId,
    from: window.from ?? null,
    to: window.to ?? null,
  }));
}

/** An extra class: a make-up session on a Saturday is not a timetable change. */
export async function scheduleSession(
  deps: SessionDeps,
  actor: DeliveryActor,
  input: {
    offeringId: string; sessionDate: string; startsAt: string; endsAt: string;
    roomId: string | null; substituteId: string | null;
  },
): Promise<Result<{ id: string }>> {
  if (input.endsAt <= input.startsAt) {
    return Err(fail('VALIDATION_FAILED', 'A class must end after it starts.', {
      fieldErrors: { endsAt: 'Must be later than the start' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const offering = await deps.offerings.findById(tx, input.offeringId);
      if (!offering) return Err(fail('NOT_FOUND', 'That course offering was not found.'));

      await deps.sessions.create(tx, {
        id, tenantId: actor.tenantId, offeringId: input.offeringId, slotId: null,
        sessionDate: input.sessionDate, startsAt: input.startsAt, endsAt: input.endsAt,
        roomId: input.roomId, substituteId: input.substituteId, createdBy: actor.personId,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'session.scheduled', subjectType: 'class_session', subjectId: id,
        scopeType: 'section', scopeRefId: offering.sectionId,
        after: {
          course: offering.courseCode, section: offering.sectionLabel,
          date: input.sessionDate, from: input.startsAt, to: input.endsAt,
          roomId: input.roomId, adHoc: true,
        },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    return Err(translate(e, 'That class could not be scheduled.'));
  }
}

export async function rescheduleSession(
  deps: SessionDeps,
  actor: DeliveryActor,
  input: {
    id: string; sessionDate: string; startsAt: string; endsAt: string;
    roomId: string | null; reason: string | null;
  },
): Promise<Result<{ id: string }>> {
  if (input.endsAt <= input.startsAt) {
    return Err(fail('VALIDATION_FAILED', 'A class must end after it starts.', {
      fieldErrors: { endsAt: 'Must be later than the start' },
    }));
  }

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const session = await deps.sessions.findById(tx, input.id);
      if (!session) return Err(fail('NOT_FOUND', 'That class was not found.'));
      if (session.status !== 'scheduled') {
        return Err(fail('CONFLICT', session.status === 'completed'
          // The database refuses this too. Saying it in words an operator can
          // act on is the point of checking here as well.
          ? 'That class has been taught. Its record cannot be moved.'
          : 'That class was cancelled, so there is nothing to move.'));
      }

      const moved = await deps.sessions.reschedule(tx, {
        id: input.id, sessionDate: input.sessionDate, startsAt: input.startsAt,
        endsAt: input.endsAt, roomId: input.roomId,
        fromDate: session.sessionDate, fromStartsAt: session.startsAt,
      });
      if (!moved) return Err(fail('CONFLICT', 'That class was changed by someone else just now.'));

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'session.rescheduled', subjectType: 'class_session', subjectId: input.id,
        scopeType: 'section', scopeRefId: session.sectionId,
        before: {
          date: session.sessionDate, from: session.startsAt, to: session.endsAt,
          roomId: session.roomId,
        },
        after: {
          date: input.sessionDate, from: input.startsAt, to: input.endsAt,
          roomId: input.roomId, course: session.courseCode, section: session.sectionLabel,
        },
        reason: input.reason?.trim() ?? null,
      }, tx);
      return Ok({ id: input.id });
    });
  } catch (e) {
    return Err(translate(e, 'That class could not be moved.'));
  }
}

export async function cancelSession(
  deps: SessionDeps, actor: DeliveryActor, input: { id: string; reason: string },
): Promise<Result<{ id: string }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. It answers why there was no class.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const session = await deps.sessions.findById(tx, input.id);
    if (!session) return Err(fail('NOT_FOUND', 'That class was not found.'));
    if (session.status === 'completed') {
      return Err(fail('CONFLICT',
        'That class has been taught, so it cannot be cancelled. Its record stands.'));
    }
    if (session.status === 'cancelled') {
      return Err(fail('CONFLICT', 'That class is already cancelled.'));
    }

    const cancelled = await deps.sessions.cancel(tx, {
      id: input.id, reason: input.reason.trim(), at,
    });
    if (!cancelled) return Err(fail('CONFLICT', 'That class was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'session.cancelled', subjectType: 'class_session', subjectId: input.id,
      scopeType: 'section', scopeRefId: session.sectionId,
      before: { status: 'scheduled' },
      after: {
        status: 'cancelled', course: session.courseCode, section: session.sectionLabel,
        date: session.sessionDate, from: session.startsAt,
      },
      reason: input.reason.trim(),
    }, tx);
    return Ok({ id: input.id });
  });
}

/**
 * Records that a class was taught.
 *
 * AD-40 in practice. A teacher holds `session.deliver`, and this checks that
 * their teaching actually reaches the class: a live assignment on the offering,
 * or standing in for this one session. An administrator holding `session.manage`
 * may record it for someone unreachable, and the audit entry says which of the
 * two happened.
 */
export async function completeSession(
  deps: SessionDeps,
  actor: DeliveryActor,
  input: { id: string; actingAs: ActingAs },
): Promise<Result<{ id: string }>> {
  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const session = await deps.sessions.findById(tx, input.id);
    if (!session) return Err(fail('NOT_FOUND', 'That class was not found.'));

    if (input.actingAs === 'teach') {
      const standingIn = session.substituteId === actor.personId;
      const assigned = await deps.reach.teachesOffering(tx, session.offeringId, actor.personId);
      if (!standingIn && !assigned) {
        // Not "forbidden because of who you are": forbidden because nobody has
        // assigned you this teaching. Reach, not identity.
        return Err(fail('FORBIDDEN',
          'You are not assigned to teach this class, so you cannot record it as taught.'));
      }
    }

    if (session.status === 'completed') {
      return Err(fail('CONFLICT', 'That class is already recorded as taught.'));
    }
    if (session.status === 'cancelled') {
      return Err(fail('CONFLICT', 'That class was cancelled, so it cannot be recorded as taught.'));
    }

    const done = await deps.sessions.complete(tx, { id: input.id, by: actor.personId, at });
    if (!done) return Err(fail('CONFLICT', 'That class was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'session.completed', subjectType: 'class_session', subjectId: input.id,
      scopeType: 'section', scopeRefId: session.sectionId,
      before: { status: 'scheduled' },
      after: {
        status: 'completed', course: session.courseCode, section: session.sectionLabel,
        date: session.sessionDate, recordedBy: input.actingAs,
      },
    }, tx);
    return Ok({ id: input.id });
  });
}

/**
 * Changes the room, or who stands in, for one class.
 *
 * Substitution reduced to its data: there is no request-and-approve workflow,
 * because none exists to hang it on yet. Clearing the stand-in returns the class
 * to whoever leads the offering.
 */
export async function reassignSession(
  deps: SessionDeps,
  actor: DeliveryActor,
  input: { id: string; roomId: string | null; substituteId: string | null; reason: string | null },
): Promise<Result<{ id: string }>> {
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const session = await deps.sessions.findById(tx, input.id);
      if (!session) return Err(fail('NOT_FOUND', 'That class was not found.'));
      if (session.status !== 'scheduled') {
        return Err(fail('CONFLICT', session.status === 'completed'
          ? 'That class has been taught. Its record cannot be changed.'
          : 'That class was cancelled.'));
      }

      const changed = await deps.sessions.reassign(tx, {
        id: input.id, roomId: input.roomId, substituteId: input.substituteId,
      });
      if (!changed) return Err(fail('CONFLICT', 'That class was changed by someone else just now.'));

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'session.reassigned', subjectType: 'class_session', subjectId: input.id,
        scopeType: 'section', scopeRefId: session.sectionId,
        before: { roomId: session.roomId, standInId: session.substituteId },
        after: {
          roomId: input.roomId, standInId: input.substituteId,
          course: session.courseCode, section: session.sectionLabel,
          date: session.sessionDate,
        },
        reason: input.reason?.trim() ?? null,
      }, tx);
      return Ok({ id: input.id });
    });
  } catch (e) {
    return Err(translate(e, 'That class could not be changed.'));
  }
}

/**
 * Database refusals reach the user as the database wrote them.
 *
 * The triggers state the clash in operational terms, naming the room, the course
 * and the cohort already there. Replacing that with generic copy would throw
 * away the only part of the message an operator can act on.
 */
function translate(e: unknown, fallback: string) {
  if (e instanceof AppException) return fail(e.code, e.message || fallback);
  throw e;
}

/**
 * Rooms and non-teaching days: the two pieces of reference data teaching
 * delivery needs before a timetable can exist.
 *
 * A room is owned by M4 because delivery is the only thing that needs one, and
 * exactly four facts are modelled. Non-teaching days are attributed to M2, whose
 * calendar they belong to, and are read here rather than owned. See AD-46.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  CalendarEventFields, CalendarEventRecord, CalendarEventRepository,
  CalendarPeriod, NonTeachingDayRecord, NonTeachingDayRepository, RoomKind, RoomRecord, RoomRepository,
} from './ports.ts';

export interface DeliveryActor {
  tenantId: string;
  personId: string;
}

export interface RoomDeps {
  uow: UnitOfWork;
  rooms: RoomRepository;
  days: NonTeachingDayRepository;
  /** CAL-2: events on the academic calendar. */
  events: CalendarEventRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

export async function createRoom(
  deps: RoomDeps,
  actor: DeliveryActor,
  input: { campusId: string; code: string; name: string; kind: RoomKind; capacity: number | null },
): Promise<Result<{ id: string }>> {
  const id = deps.ids.next();
  // Normalised here, at the boundary, so 'lh-204' and 'LH-204' cannot become
  // two rooms that never collide with each other.
  const code = input.code.trim().toUpperCase();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      await deps.rooms.create(tx, {
        id, tenantId: actor.tenantId, campusId: input.campusId, code,
        name: input.name.trim(), kind: input.kind, capacity: input.capacity,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'room.created', subjectType: 'room', subjectId: id,
        after: { code, name: input.name.trim(), kind: input.kind, capacity: input.capacity },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `Room ${code} already exists on that campus.`));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listRooms(
  deps: RoomDeps, actor: DeliveryActor,
  filter: { campusId?: string | null; includeArchived?: boolean } = {},
): Promise<RoomRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.rooms.list(tx, filter));
}

export async function updateRoom(
  deps: RoomDeps,
  actor: DeliveryActor,
  input: { id: string; name: string; kind: RoomKind; capacity: number | null },
): Promise<Result<{ id: string }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const before = await deps.rooms.findById(tx, input.id);
    if (!before) return Err(fail('NOT_FOUND', 'That room was not found.'));
    if (before.status !== 'active') {
      return Err(fail('CONFLICT', `Room ${before.code} is archived.`));
    }

    const changed = await deps.rooms.update(tx, {
      id: input.id, name: input.name.trim(), kind: input.kind, capacity: input.capacity,
    });
    if (!changed) return Err(fail('CONFLICT', 'That room was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'room.updated', subjectType: 'room', subjectId: input.id,
      before: { name: before.name, kind: before.kind, capacity: before.capacity },
      after: { name: input.name.trim(), kind: input.kind, capacity: input.capacity },
    }, tx);
    return Ok({ id: input.id });
  });
}

export async function archiveRoom(
  deps: RoomDeps, actor: DeliveryActor, id: string,
): Promise<Result<{ id: string }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const room = await deps.rooms.findById(tx, id);
    if (!room) return Err(fail('NOT_FOUND', 'That room was not found.'));
    if (room.status !== 'active') {
      return Err(fail('CONFLICT', `Room ${room.code} is already archived.`));
    }
    // Refused rather than cascaded: silently emptying a timetable is worse than
    // making someone move the classes first.
    if (room.slotCount > 0) {
      return Err(fail('CONFLICT',
        `Room ${room.code} still holds ${room.slotCount} timetable ${
          room.slotCount === 1 ? 'slot' : 'slots'}. Move those classes first.`));
    }

    const archived = await deps.rooms.archive(tx, id);
    if (!archived) return Err(fail('CONFLICT', 'That room was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'room.archived', subjectType: 'room', subjectId: id,
      before: { status: 'active' }, after: { status: 'archived', code: room.code },
    }, tx);
    return Ok({ id });
  });
}

/* ------------------------------------------------------- non-teaching days */

/** CAL-1: the most days one request may close, so a typo cannot close a year. */
export const MAX_DAYS_AT_ONCE = 60;

/** Every calendar date from [from] to [to], inclusive; null when either is not a real date or to < from. */
export function datesBetween(from: string, to: string): string[] | null {
  const parse = (d: string) => {
    const at = new Date(`${d}T00:00:00Z`);
    return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== d ? null : at;
  };
  const start = parse(from);
  const end = parse(to);
  if (!start || !end || end < start) return null;
  const dates: string[] = [];
  for (const at = start; at <= end && dates.length <= MAX_DAYS_AT_ONCE; at.setUTCDate(at.getUTCDate() + 1)) {
    dates.push(at.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Closes one day, or (CAL-1) every day from [onDate] to [toDate] under one
 * label: a Diwali break is one entry for the person typing it. All or none: if
 * any day is already closed, nothing is added and that day is named.
 */
export async function addNonTeachingDay(
  deps: RoomDeps, actor: DeliveryActor, input: { onDate: string; toDate?: string | null; label: string },
): Promise<Result<{ id: string; ids: string[] }>> {
  const dates = datesBetween(input.onDate, input.toDate ?? input.onDate);
  if (!dates) return Err(fail('VALIDATION_FAILED', 'The last day cannot be before the first.'));
  if (dates.length > MAX_DAYS_AT_ONCE) {
    return Err(fail('VALIDATION_FAILED', `At most ${MAX_DAYS_AT_ONCE} days can be added at once.`));
  }
  const label = input.label.trim();
  let current = dates[0]!;
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const ids: string[] = [];
      for (const onDate of dates) {
        current = onDate;
        const id = deps.ids.next();
        await deps.days.create(tx, { id, tenantId: actor.tenantId, onDate, label, createdBy: actor.personId });
        await deps.audit.record({
          correlationId: deps.ids.next(), tenantId: actor.tenantId,
          actorType: 'person', actorId: actor.personId,
          action: 'calendar.day_closed', subjectType: 'non_teaching_day', subjectId: id,
          after: { date: onDate, label },
        }, tx);
        ids.push(id);
      }
      return Ok({ id: ids[0]!, ids });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `${current} is already marked as a non-teaching day.`));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/** CAL-1, CAL-2: holidays, events, years and terms in a range, for anyone in the college. */
export function readCalendar(
  deps: RoomDeps, actor: DeliveryActor, range: { from?: string | null; to?: string | null },
): Promise<{ holidays: NonTeachingDayRecord[]; events: CalendarEventRecord[]; periods: CalendarPeriod[] }> {
  return deps.uow.run(actor.tenantId, async (tx) => ({
    holidays: await deps.days.list(tx, range),
    events: await deps.events.list(tx, range),
    periods: await deps.days.periods(tx, range),
  }));
}

/* --------------------------------------------------------- calendar events */

export interface CalendarEventInput {
  title: string;
  onDate: string;
  startsAt?: string | null;
  endsAt?: string | null;
  note?: string | null;
}

function checkEvent(input: CalendarEventInput): Result<CalendarEventFields> {
  const invalid = (field: string, message: string) =>
    Err(fail('VALIDATION_FAILED', message, { fieldErrors: { [field]: message } }));
  const title = input.title.trim();
  if (!title || title.length > 120) return invalid('title', 'Give the event a name, up to 120 characters.');
  if (!datesBetween(input.onDate, input.onDate)) return invalid('on_date', 'That date does not exist.');
  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  if ((startsAt === null) !== (endsAt === null)) {
    return invalid('ends_at', 'Give both a start and an end time, or neither for a full day.');
  }
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    return invalid('ends_at', 'The end time must be after the start time.');
  }
  return Ok({ title, onDate: input.onDate, startsAt, endsAt, note: input.note?.trim() || null });
}

export async function addCalendarEvent(
  deps: RoomDeps, actor: DeliveryActor, input: CalendarEventInput,
): Promise<Result<{ id: string }>> {
  const checked = checkEvent(input);
  if (!checked.ok) return checked;
  const id = deps.ids.next();
  return deps.uow.run(actor.tenantId, async (tx) => {
    await deps.events.create(tx, { ...checked.value, id, tenantId: actor.tenantId, createdBy: actor.personId });
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'calendar.event_added', subjectType: 'calendar_event', subjectId: id,
      after: { ...checked.value },
    }, tx);
    return Ok({ id });
  });
}

export async function updateCalendarEvent(
  deps: RoomDeps, actor: DeliveryActor, id: string, input: CalendarEventInput,
): Promise<Result<{ id: string }>> {
  const checked = checkEvent(input);
  if (!checked.ok) return checked;
  return deps.uow.run(actor.tenantId, async (tx) => {
    const before = await deps.events.find(tx, id);
    if (!before) return Err(fail('NOT_FOUND', 'That event was not found.'));
    if (!(await deps.events.update(tx, id, checked.value))) {
      return Err(fail('CONFLICT', 'That event was changed by someone else just now.'));
    }
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'calendar.event_changed', subjectType: 'calendar_event', subjectId: id,
      before: { ...before }, after: { ...checked.value },
    }, tx);
    return Ok({ id });
  });
}

export async function removeCalendarEvent(
  deps: RoomDeps, actor: DeliveryActor, id: string,
): Promise<Result<{ id: string }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const before = await deps.events.find(tx, id);
    if (!before || !(await deps.events.remove(tx, id, actor.personId))) {
      return Err(fail('NOT_FOUND', 'That event was not found.'));
    }
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'calendar.event_removed', subjectType: 'calendar_event', subjectId: id,
      before: { title: before.title, date: before.onDate }, after: { removed: true },
    }, tx);
    return Ok({ id });
  });
}

export function listNonTeachingDays(
  deps: RoomDeps, actor: DeliveryActor, range: { from?: string | null; to?: string | null } = {},
): Promise<NonTeachingDayRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.days.list(tx, range));
}

/**
 * Removes a non-teaching day. Genuinely deleted, not archived: nothing
 * references it, and generation reads the list live.
 *
 * Sessions already generated around a removed holiday are NOT created
 * retroactively. Generation is idempotent and can simply be run again, which is
 * both simpler and more honest than a hidden side effect.
 */
export async function removeNonTeachingDay(
  deps: RoomDeps, actor: DeliveryActor, id: string,
): Promise<Result<{ id: string }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const removed = await deps.days.remove(tx, id);
    if (!removed) return Err(fail('NOT_FOUND', 'That day was not found.'));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'calendar.day_reopened', subjectType: 'non_teaching_day', subjectId: id,
      before: { closed: true }, after: { closed: false },
    }, tx);
    return Ok({ id });
  });
}

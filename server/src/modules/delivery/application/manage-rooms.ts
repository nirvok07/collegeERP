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
  NonTeachingDayRecord, NonTeachingDayRepository, RoomKind, RoomRecord, RoomRepository,
} from './ports.ts';

export interface DeliveryActor {
  tenantId: string;
  personId: string;
}

export interface RoomDeps {
  uow: UnitOfWork;
  rooms: RoomRepository;
  days: NonTeachingDayRepository;
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

export async function addNonTeachingDay(
  deps: RoomDeps, actor: DeliveryActor, input: { onDate: string; label: string },
): Promise<Result<{ id: string }>> {
  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      await deps.days.create(tx, {
        id, tenantId: actor.tenantId, onDate: input.onDate,
        label: input.label.trim(), createdBy: actor.personId,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'calendar.day_closed', subjectType: 'non_teaching_day', subjectId: id,
        after: { date: input.onDate, label: input.label.trim() },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `${input.onDate} is already marked as a non-teaching day.`));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
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

/**
 * The recurring weekly intention, and turning it into concrete occurrences.
 *
 * A slot is edited; a session happened. Generation is the one place the two
 * meet, and it is deliberately idempotent: a coordinator will run it twice.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail, violatedConstraint } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  OfferingRepository, TermRepository,
} from '../../teaching/application/ports.ts';
import type {
  Clash, NonTeachingDayRepository, SessionRepository, SlotRecord, SlotRepository,
} from './ports.ts';
import type { DeliveryActor } from './manage-rooms.ts';

export interface TimetableDeps {
  uow: UnitOfWork;
  slots: SlotRepository;
  sessions: SessionRepository;
  days: NonTeachingDayRepository;
  offerings: OfferingRepository;
  terms: TermRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

/** A term is never this long. The guard is against a typo, not a use case. */
const MAX_WINDOW_DAYS = 400;

export async function addSlot(
  deps: TimetableDeps,
  actor: DeliveryActor,
  input: {
    offeringId: string; dayOfWeek: number; startsAt: string; endsAt: string;
    roomId: string | null;
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
      if (offering.status === 'completed' || offering.status === 'cancelled') {
        return Err(fail('CONFLICT',
          `${offering.courseCode} is ${offering.status} and takes no timetable.`));
      }

      await deps.slots.create(tx, {
        id, tenantId: actor.tenantId, offeringId: input.offeringId,
        dayOfWeek: input.dayOfWeek, startsAt: input.startsAt, endsAt: input.endsAt,
        roomId: input.roomId, createdBy: actor.personId,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'timetable.slot_added', subjectType: 'timetable_slot', subjectId: id,
        scopeType: 'section', scopeRefId: offering.sectionId,
        after: {
          offering: input.offeringId, course: offering.courseCode,
          section: offering.sectionLabel, day: input.dayOfWeek,
          from: input.startsAt, to: input.endsAt, roomId: input.roomId,
        },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      // The room clash comes from a trigger that names the room and the course
      // already there, which is the only part a coordinator can act on. Only
      // the bare unique-index violation needs a sentence written for it.
      return Err(fail('CONFLICT',
        violatedConstraint(e) === null
          ? e.message
          : 'That course already has a class at that hour on that day.'));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listSlots(
  deps: TimetableDeps, actor: DeliveryActor,
  filter: { offeringId?: string | null; termId?: string | null },
): Promise<SlotRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.slots.list(tx, filter));
}

/**
 * Removes a slot from the pattern.
 *
 * Sessions already generated from it are deliberately left alone. They are
 * either history or a schedule people have been told about, and removing a
 * weekly pattern is not a statement that last Tuesday's class did not happen.
 * Cancelling the future ones is a separate, explicit act.
 */
export async function removeSlot(
  deps: TimetableDeps, actor: DeliveryActor, id: string,
): Promise<Result<{ id: string }>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const slot = await deps.slots.findById(tx, id);
    if (!slot) return Err(fail('NOT_FOUND', 'That timetable slot was not found.'));

    const removed = await deps.slots.remove(tx, id);
    if (!removed) return Err(fail('CONFLICT', 'That slot was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'timetable.slot_removed', subjectType: 'timetable_slot', subjectId: id,
      scopeType: 'section', scopeRefId: slot.sectionId,
      before: {
        course: slot.courseCode, section: slot.sectionLabel,
        day: slot.dayOfWeek, from: slot.startsAt, to: slot.endsAt,
      },
      reason: 'Classes already scheduled from this slot are left in place',
    }, tx);
    return Ok({ id });
  });
}

export interface GenerationReport {
  from: string;
  to: string;
  created: number;
  /** Occurrences that already existed, which is what makes a re-run safe. */
  alreadyThere: number;
  /** Dates the institution does not teach, skipped by name. */
  skippedDays: Array<{ date: string; label: string }>;
  clashes: Clash[];
  occurrences: Array<{ date: string; startsAt: string; endsAt: string; roomId: string | null }>;
}

/**
 * Expands one offering's weekly pattern into class sessions across its term.
 *
 * Bounded by the term's own dates, whatever window the caller asks for: a class
 * outside its term is refused by the database anyway, and silently clamping is
 * kinder than an error for an obvious intent.
 *
 * All or nothing. A room clash stops the whole generation rather than leaving a
 * half-built timetable, which is why `preview` exists: it reports exactly what
 * would happen without writing.
 */
export async function generateSessions(
  deps: TimetableDeps,
  actor: DeliveryActor,
  input: { offeringId: string; from?: string | null; to?: string | null; preview: boolean },
): Promise<Result<GenerationReport>> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const offering = await deps.offerings.findById(tx, input.offeringId);
    if (!offering) return Err(fail('NOT_FOUND', 'That course offering was not found.'));
    if (offering.status === 'completed' || offering.status === 'cancelled') {
      return Err(fail('CONFLICT',
        `${offering.courseCode} is ${offering.status} and takes no more classes.`));
    }

    const term = await deps.terms.findById(tx, offering.termId);
    if (!term) return Err(fail('CONFLICT', 'That cohort has no term, so classes have no dates.'));

    const from = laterOf(input.from ?? term.startsOn, term.startsOn);
    const to = earlierOf(input.to ?? term.endsOn, term.endsOn);
    if (from > to) {
      return Err(fail('VALIDATION_FAILED',
        `${term.name} runs ${term.startsOn} to ${term.endsOn}, so that window holds no classes.`));
    }
    if (daysBetween(from, to) > MAX_WINDOW_DAYS) {
      return Err(fail('VALIDATION_FAILED', 'That date range is too long to be a term.'));
    }

    const slots = await deps.slots.list(tx, { offeringId: input.offeringId });
    if (slots.length === 0) {
      return Err(fail('CONFLICT',
        `${offering.courseCode} has no weekly timetable yet. Add when it meets, then schedule it.`));
    }

    const closed = new Map(
      (await deps.days.list(tx, { from, to })).map((d) => [d.onDate, d.label]),
    );
    const existing = new Set(
      (await deps.sessions.existingOccurrences(tx, input.offeringId, from, to))
        .map((o) => `${o.date} ${o.startsAt}`),
    );

    const occurrences: Array<{
      date: string; startsAt: string; endsAt: string; roomId: string | null; slotId: string;
    }> = [];
    const skippedDays: Array<{ date: string; label: string }> = [];
    let alreadyThere = 0;

    for (const date of eachDate(from, to)) {
      const label = closed.get(date);
      const today = slots.filter((s) => s.dayOfWeek === isoDayOfWeek(date));
      if (today.length === 0) continue;
      if (label !== undefined) { skippedDays.push({ date, label }); continue; }

      for (const slot of today) {
        if (existing.has(`${date} ${slot.startsAt}`)) { alreadyThere++; continue; }
        occurrences.push({
          date, startsAt: slot.startsAt, endsAt: slot.endsAt,
          roomId: slot.roomId, slotId: slot.id,
        });
      }
    }

    const clashes = await deps.sessions.clashesFor(tx, {
      offeringId: input.offeringId,
      occurrences: occurrences.map(({ date, startsAt, endsAt, roomId }) =>
        ({ date, startsAt, endsAt, roomId })),
    });

    const report: GenerationReport = {
      from, to, created: 0, alreadyThere, skippedDays, clashes,
      occurrences: occurrences.map(({ date, startsAt, endsAt, roomId }) =>
        ({ date, startsAt, endsAt, roomId })),
    };

    if (input.preview) return Ok(report);

    if (clashes.length > 0) {
      const first = clashes[0]!;
      return Err(fail('CONFLICT', first.kind === 'room'
        ? `Room ${first.subject} already holds ${first.withCourseCode} for section ${
          first.withSectionLabel} on ${first.sessionDate} at ${first.startsAt}. Nothing was scheduled.`
        : `${first.subject} already teaches ${first.withCourseCode} to section ${
          first.withSectionLabel} on ${first.sessionDate} at ${first.startsAt}. Nothing was scheduled.`));
    }

    for (const occurrence of occurrences) {
      await deps.sessions.create(tx, {
        id: deps.ids.next(), tenantId: actor.tenantId, offeringId: input.offeringId,
        slotId: occurrence.slotId, sessionDate: occurrence.date,
        startsAt: occurrence.startsAt, endsAt: occurrence.endsAt,
        roomId: occurrence.roomId, substituteId: null, createdBy: actor.personId,
      });
    }

    // One audit entry, because generation is one act. Each session carries its
    // own creator and timestamp, so nothing about it is unattributable.
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'timetable.generated', subjectType: 'course_offering',
      subjectId: input.offeringId,
      scopeType: 'section', scopeRefId: offering.sectionId,
      after: {
        course: offering.courseCode, section: offering.sectionLabel,
        from, to, created: occurrences.length, alreadyThere,
        skippedDays: skippedDays.length,
      },
    }, tx);

    return Ok({ ...report, created: occurrences.length });
  });
}

/* --------------------------------------------------------- calendar helpers */
/**
 * All date arithmetic happens in UTC on 'YYYY-MM-DD' strings.
 *
 * A local-midnight Date would shift the day for every timezone east of UTC and
 * again across a daylight-saving boundary, which is precisely the class of bug
 * that makes a timetable wrong by one day in some months and not others.
 */
const DAY_MS = 86_400_000;

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** ISO-8601 day numbering: 1 is Monday, 7 is Sunday. Matches PostgreSQL isodow. */
export function isoDayOfWeek(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const laterOf = (a: string, b: string) => (a > b ? a : b);
const earlierOf = (a: string, b: string) => (a < b ? a : b);

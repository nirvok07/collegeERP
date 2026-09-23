/**
 * SA-ATT-1: a staff member's own attendance, punched in and out.
 *
 * Distinct from M6 (a teacher marking a class's roster): this is self-scoped,
 * derived entirely from the token subject, and needs no permission beyond
 * being a signed-in college person — exactly like `/me/sessions`.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { StaffAttendanceRecord, StaffAttendanceRepository } from './ports.ts';

export interface SelfAttendanceDeps {
  uow: UnitOfWork;
  staffAttendance: StaffAttendanceRepository;
  ids: IdGenerator;
  clock: Clock;
}

export interface SelfAttendanceActor {
  tenantId: string;
  personId: string;
}

function workDateOf(at: Date): string {
  // The college's own day, not UTC's: a punch just after midnight IST must
  // not land on yesterday.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(at);
}

export function punchIn(
  deps: SelfAttendanceDeps, actor: SelfAttendanceActor,
): Promise<Result<StaffAttendanceRecord>> {
  const at = deps.clock.now();
  const workDate = workDateOf(at);
  return deps.uow.run(actor.tenantId, async (tx) => {
    const existing = await deps.staffAttendance.findByDate(tx, actor.personId, workDate);
    if (existing) {
      if (existing.punchOutAt === null) {
        return Err(fail('CONFLICT', 'Already punched in today.'));
      }
      return Err(fail('CONFLICT', 'Already punched out for today.'));
    }
    const record = await deps.staffAttendance.punchIn(tx, {
      id: deps.ids.next(), tenantId: actor.tenantId, personId: actor.personId, workDate, at,
    });
    return Ok(record);
  });
}

export function punchOut(
  deps: SelfAttendanceDeps, actor: SelfAttendanceActor,
): Promise<Result<StaffAttendanceRecord>> {
  const at = deps.clock.now();
  const workDate = workDateOf(at);
  return deps.uow.run(actor.tenantId, async (tx) => {
    const existing = await deps.staffAttendance.findByDate(tx, actor.personId, workDate);
    if (!existing) return Err(fail('CONFLICT', 'Punch in first.'));
    if (existing.punchOutAt !== null) return Err(fail('CONFLICT', 'Already punched out for today.'));
    await deps.staffAttendance.punchOut(tx, { id: existing.id, at });
    return Ok({ ...existing, punchOutAt: at });
  });
}

export function myAttendance(
  deps: SelfAttendanceDeps, actor: SelfAttendanceActor, range: { from: string; to: string },
): Promise<StaffAttendanceRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.staffAttendance.history(tx, actor.personId, range));
}

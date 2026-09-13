/**
 * SA-1: the platform's view of one college, its lifecycle, and the
 * administrator invitation. The platform owns the lifecycle and nothing inside
 * the college; the one M1 record it touches, the invitation, goes through M1's
 * capability.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { InstitutionRecord, InstitutionRepository } from './ports.ts';
import type { BootstrapAdministrator } from '../../identity/application/ports.ts';
import {
  reissueAdministratorInvitation, type ReissueInvitationDeps,
} from '../../identity/application/reissue-invitation.ts';
import { availableActions, targetOf, type LifecycleAction } from '../domain/lifecycle.ts';
import { seatUsage, type SeatUsage } from '../../identity/domain/seats.ts';

export interface LifecycleDeps {
  uow: UnitOfWork;
  institutions: InstitutionRepository;
  identity: ReissueInvitationDeps;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  /** Called after a status change commits, so access checks see it at once. */
  onStatusChanged: (institutionId: string) => void;
}

export type InvitationState = 'pending' | 'expired' | 'accepted' | 'revoked' | 'none';

export interface InstitutionDetail {
  institution: InstitutionRecord;
  actions: LifecycleAction[];
  /** AD-65. Informational: the database is what refuses a seat. */
  seats: SeatUsage;
  administrator: (BootstrapAdministrator & {
    invitation: { state: InvitationState; expiresAt: Date | null };
    canReissue: boolean;
  }) | null;
}

const ACTION_EVENT: Record<LifecycleAction, string> = {
  suspend: 'institution.suspended',
  reactivate: 'institution.reactivated',
  close: 'institution.closed',
};

export async function getInstitutionDetail(
  deps: LifecycleDeps,
  id: string,
): Promise<Result<InstitutionDetail>> {
  // Scoped to the college, so the administrator's rows are read under its own
  // row-level security, never across tenants.
  return deps.uow.run(id, async (tx) => {
    const institution = await deps.institutions.findById(tx, id);
    if (!institution) return Err(fail('NOT_FOUND', 'That college was not found.'));
    return Ok(await detailOf(deps, tx, institution));
  });
}

async function detailOf(
  deps: LifecycleDeps,
  tx: Parameters<Parameters<UnitOfWork['run']>[1]>[0],
  institution: InstitutionRecord,
): Promise<InstitutionDetail> {
  const admin = await deps.identity.accounts.findBootstrapAdministrator(tx);
  let administrator: InstitutionDetail['administrator'] = null;
  if (admin) {
    const latest = await deps.identity.invitations.latestFor(tx, admin.accountId);
    const now = deps.clock.now();
    const state: InvitationState = !latest
      ? 'none'
      : latest.consumedAt ? 'accepted'
      : latest.revokedAt ? 'revoked'
      : latest.expiresAt.getTime() <= now.getTime() ? 'expired'
      : 'pending';
    administrator = {
      ...admin,
      invitation: { state, expiresAt: latest?.expiresAt ?? null },
      canReissue: admin.accountStatus === 'invited' && canInvite(institution.status),
    };
  }
  return {
    institution,
    actions: availableActions(institution.status, institution.suspendedFrom ?? null),
    seats: seatUsage(await deps.identity.accounts.countLive(tx, institution.id), institution.seatLimit),
    administrator,
  };
}

/**
 * SA-4a: the college's plan and seat limit, Owner only. The plan is a label
 * with no price and no effect; the limit is independent of it. A limit below
 * current use is allowed and disables nobody (AD-65): the seat trigger then
 * refuses new live accounts until use falls under it.
 */
export async function changePlan(
  deps: LifecycleDeps,
  input: {
    id: string;
    version: number;
    reason: string;
    plan?: string;
    seatLimit?: number;
    platformAccountId: string;
  },
): Promise<Result<InstitutionDetail>> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return Err(fail('VALIDATION_FAILED', 'Say why, in a few words.', { fieldErrors: { reason: 'Required' } }));
  }
  const plan = input.plan?.trim();
  if (plan !== undefined && !/^[\p{L}\p{N} _.-]{1,40}$/u.test(plan)) {
    return Err(fail('VALIDATION_FAILED', 'A plan is a short label: letters, numbers, spaces, dots, hyphens.', {
      fieldErrors: { plan: 'Invalid plan' },
    }));
  }
  if (input.seatLimit !== undefined && (!Number.isInteger(input.seatLimit) || input.seatLimit < 1 || input.seatLimit > 1_000_000)) {
    return Err(fail('VALIDATION_FAILED', 'The seat limit is a whole number of at least 1.', {
      fieldErrors: { seat_limit: 'Invalid limit' },
    }));
  }
  try {
    return await deps.uow.run(input.id, async (tx) => {
      const current = await deps.institutions.findById(tx, input.id);
      if (!current) return Err(fail('NOT_FOUND', 'That college was not found.'));
      if (current.status === 'closed') return Err(fail('CONFLICT', 'A closed college cannot be changed.'));
      const nextPlan = plan ?? current.plan;
      const nextLimit = input.seatLimit ?? current.seatLimit;
      if (nextPlan === current.plan && nextLimit === current.seatLimit) {
        return Err(fail('VALIDATION_FAILED', 'Nothing changed.'));
      }
      const updated = await deps.institutions.setPlan(tx, input.id, input.version, nextPlan, nextLimit);
      if (!updated) return Err(fail('CONFLICT', 'Somebody else changed this college. Reload and try again.'));
      const detail = await detailOf(deps, tx, updated);
      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: input.id,
        actorType: 'platform',
        actorId: input.platformAccountId,
        action: 'institution.plan_changed',
        subjectType: 'institution',
        subjectId: input.id,
        before: { plan: current.plan, seat_limit: current.seatLimit },
        after: { plan: updated.plan, seat_limit: updated.seatLimit, seats_used: detail.seats.used, seat_state: detail.seats.state },
        reason,
      }, tx);
      return Ok(detail);
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/** An invitation is pointless to a college nobody may use. */
const canInvite = (status: InstitutionRecord['status']) => status === 'trial' || status === 'active';

export async function changeLifecycle(
  deps: LifecycleDeps,
  input: {
    id: string;
    action: LifecycleAction;
    version: number;
    reason: string;
    confirmCode?: string;
    platformAccountId: string;
  },
): Promise<Result<InstitutionDetail>> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return Err(fail('VALIDATION_FAILED', 'Say why, in a few words.', { fieldErrors: { reason: 'Required' } }));
  }
  try {
    const result = await deps.uow.run(input.id, async (tx) => {
      const current = await deps.institutions.findById(tx, input.id);
      if (!current) return Err(fail('NOT_FOUND', 'That college was not found.'));

      const target = targetOf(input.action, current.status, current.suspendedFrom ?? null);
      if (!target) {
        return Err(fail('CONFLICT', `A ${current.status} college cannot be ${pastTense(input.action)}.`));
      }
      // Closing is final, so it is confirmed by typing the college's code, and
      // the server checks it rather than trusting that the screen did.
      if (input.action === 'close' && input.confirmCode?.trim().toLowerCase() !== current.code) {
        return Err(fail('VALIDATION_FAILED', 'Type the college code to confirm closing it.', {
          fieldErrors: { confirm_code: 'Does not match' },
        }));
      }

      const updated = await deps.institutions.setStatus(tx, input.id, input.version, target);
      if (!updated) {
        return Err(fail('CONFLICT', 'Somebody else changed this college. Reload and try again.'));
      }
      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: input.id,
        actorType: 'platform',
        actorId: input.platformAccountId,
        action: ACTION_EVENT[input.action],
        subjectType: 'institution',
        subjectId: input.id,
        before: { status: current.status },
        after: { status: updated.status },
        reason,
      }, tx);
      return Ok(await detailOf(deps, tx, updated));
    });
    if (result.ok) deps.onStatusChanged(input.id);
    return result;
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function reissueInvitation(
  deps: LifecycleDeps,
  input: { id: string; platformAccountId: string },
): Promise<Result<{ detail: InstitutionDetail; token: string; expiresAt: Date }>> {
  try {
    return await deps.uow.run(input.id, async (tx) => {
      const institution = await deps.institutions.findById(tx, input.id);
      if (!institution) return Err(fail('NOT_FOUND', 'That college was not found.'));
      if (!canInvite(institution.status)) {
        return Err(fail('CONFLICT', `A ${institution.status} college cannot be sent an invitation.`));
      }
      const issued = await reissueAdministratorInvitation(deps.identity, tx, {
        tenantId: input.id,
        platformAccountId: input.platformAccountId,
        correlationId: deps.ids.next(),
      });
      return Ok({ detail: await detailOf(deps, tx, institution), token: issued.token, expiresAt: issued.expiresAt });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

const pastTense = (a: LifecycleAction) =>
  ({ suspend: 'suspended', reactivate: 'reactivated', close: 'closed' })[a];

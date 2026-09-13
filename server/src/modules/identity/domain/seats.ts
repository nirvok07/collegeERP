/**
 * AD-65: what a seat is. One live college account is one seat. Live has the
 * same meaning as in the database (user_accounts_one_live_per_person_uq and
 * the seat trigger of migration 023), so the two can never disagree.
 */
export const LIVE_ACCOUNT_STATUSES = ['invited', 'active', 'locked', 'suspended'] as const;

export type SeatState = 'UNDER_LIMIT' | 'AT_LIMIT' | 'OVER_LIMIT';

export interface SeatUsage {
  used: number;
  limit: number;
  remaining: number;
  state: SeatState;
}

/** At or over the limit, the database refuses every new live account. */
export function seatUsage(used: number, limit: number): SeatUsage {
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    state: used < limit ? 'UNDER_LIMIT' : used === limit ? 'AT_LIMIT' : 'OVER_LIMIT',
  };
}

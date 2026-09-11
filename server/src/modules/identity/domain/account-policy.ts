/**
 * Credential and lockout policy. Pure, so the rules are testable without a
 * database or a clock.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_WINDOW_MINUTES = 15;
export const LOCK_DURATION_MINUTES = 30;

export type AccountStatus =
  | 'invited'
  | 'active'
  | 'locked'
  | 'suspended'
  | 'deactivated'
  | 'archived';

export interface AccountSecurityState {
  status: AccountStatus;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export type SignInDecision =
  | { kind: 'allow' }
  | { kind: 'locked'; until: Date }
  | { kind: 'not_active'; status: AccountStatus };

/** BR-11. Evaluated before the credential is checked, so a locked account never leaks timing. */
export function evaluateSignIn(state: AccountSecurityState, at: Date): SignInDecision {
  if (state.lockedUntil && state.lockedUntil.getTime() > at.getTime()) {
    return { kind: 'locked', until: state.lockedUntil };
  }
  if (state.status === 'locked') return { kind: 'allow' }; // lock has elapsed
  if (state.status !== 'active') return { kind: 'not_active', status: state.status };
  return { kind: 'allow' };
}

export function afterFailedAttempt(
  state: AccountSecurityState,
  at: Date,
): { failedAttempts: number; lockedUntil: Date | null; status: AccountStatus } {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts,
      lockedUntil: new Date(at.getTime() + LOCK_DURATION_MINUTES * 60_000),
      status: 'locked',
    };
  }
  return { failedAttempts, lockedUntil: state.lockedUntil, status: state.status };
}

export function afterSuccessfulSignIn(state: AccountSecurityState): {
  failedAttempts: number;
  lockedUntil: null;
  status: AccountStatus;
} {
  return {
    failedAttempts: 0,
    lockedUntil: null,
    status: state.status === 'locked' ? 'active' : state.status,
  };
}

export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(plaintext: string): string | null {
  if (plaintext.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(plaintext) || !/[0-9]/.test(plaintext)) {
    return 'Use at least one letter and one number.';
  }
  return null;
}

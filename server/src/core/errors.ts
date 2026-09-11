/**
 * Two types, one direction (architecture section 2.6).
 *
 * AppException is thrown inside the data layer and represents a technical fault.
 * Failure is the domain-facing value returned from use cases. Its `message` is
 * user-safe and is shown directly; technical detail goes to logs only.
 */

export type FailureCode =
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'TENANT_SUSPENDED'
  | 'SEAT_LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface Failure {
  code: FailureCode;
  message: string;
  fieldErrors?: Record<string, string>;
  /** Never serialised to a client. Logged only. */
  detail?: string;
}

export const fail = (
  code: FailureCode,
  message: string,
  extra?: { fieldErrors?: Record<string, string>; detail?: string },
): Failure => ({ code, message, ...extra });

export const httpStatusFor = (code: FailureCode): number =>
  ({
    UNAUTHENTICATED: 401,
    TOKEN_EXPIRED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VALIDATION_FAILED: 422,
    CONFLICT: 409,
    ACCOUNT_LOCKED: 423,
    ACCOUNT_NOT_ACTIVE: 403,
    TENANT_SUSPENDED: 403,
    SEAT_LIMIT_REACHED: 409,
    RATE_LIMITED: 429,
    UNKNOWN: 500,
  })[code];

export class AppException extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AppException';
    this.code = code;
  }
}

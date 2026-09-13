/**
 * AD-62: the platform's second factor, in one place. Standard authenticator-app
 * TOTP (RFC 6238): HMAC-SHA1, six digits, thirty-second steps. A code from the
 * step before or after is accepted to absorb clock drift, and a code is never
 * accepted twice: its step must be later than the last one accepted.
 */
export const TOTP_POLICY = {
  algorithm: 'sha1',
  digits: 6,
  periodSeconds: 30,
  toleranceSeconds: 30,
  issuer: 'College Platform',
} as const;

/** The step between password and code. Short, single use. */
export const SECOND_FACTOR_TTL_SECONDS = 300;
/** Setting up an authenticator takes longer than typing a code. */
export const ENROLMENT_TTL_SECONDS = 900;
/** Wrong codes on one challenge before it is spent. The account lockout also counts them. */
export const CHALLENGE_MAX_ATTEMPTS = 5;

/** AD-63 sealing contexts: a sealed secret opens only for its own account and purpose. */
export const totpContext = (accountId: string) => `platform_totp:${accountId}`;
export const pendingTotpContext = (accountId: string) => `platform_totp_pending:${accountId}`;

export const isTotpCode = (value: string) => /^\d{6}$/.test(value);

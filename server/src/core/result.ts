/**
 * A hand-written sealed Result, per client decision D10. One discriminated union
 * with an exhaustive match covers the entire need; a functional-programming
 * dependency would add vocabulary for no gain.
 *
 * Repositories and use cases return Result. No exception escapes a use case.
 */
import type { Failure } from './errors.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const Err = <T = never>(error: Failure): Result<T> => ({ ok: false, error });

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}

/** Unwrap for call sites that have already proven success, e.g. tests. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`unwrap on failure: ${r.error.code} ${r.error.message}`);
  return r.value;
}

/**
 * Effective authority. Pure policy over assignments already loaded by the caller.
 *
 * AD-16: resolution happens at request time. AD-18: deny by default, and a person
 * with no assignment is a designed state, not an error.
 */
import { scopeContains, type Scope, type ScopeAncestry } from './scope.ts';

export interface ActiveAssignment {
  id: string;
  roleId: string;
  roleKey: string;
  permissionKeys: readonly string[];
  scope: Scope;
  validFrom: Date;
  validTo: Date | null;
  /** Present when the authority is exercised through a delegation (AD-17). */
  onBehalfOfPersonId?: string | null;
}

export interface Authority {
  readonly personId: string;
  readonly tenantId: string;
  readonly assignments: readonly ActiveAssignment[];
}

export function isCurrentlyValid(a: ActiveAssignment, at: Date): boolean {
  if (a.validFrom.getTime() > at.getTime()) return false;
  if (a.validTo !== null && a.validTo.getTime() <= at.getTime()) return false;
  return true;
}

/** Every permission the person currently holds anywhere. Use for interface shaping only. */
export function permissionKeys(authority: Authority, at: Date): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const a of authority.assignments) {
    if (!isCurrentlyValid(a, at)) continue;
    for (const k of a.permissionKeys) keys.add(k);
  }
  return keys;
}

/**
 * BR-20. Granted if any currently valid assignment carries the permission AND its
 * scope contains the target. This is the authorisation decision; everything else
 * in this module is presentation.
 */
export function can(
  authority: Authority,
  permission: string,
  target: Scope,
  targetAncestry: readonly ScopeAncestry[],
  at: Date,
): boolean {
  for (const a of authority.assignments) {
    if (!isCurrentlyValid(a, at)) continue;
    if (!a.permissionKeys.includes(permission)) continue;
    if (scopeContains(a.scope, target, targetAncestry)) return true;
  }
  return false;
}

/** True when the person holds no valid authority at all: the "no access yet" state. */
export function hasNoAuthority(authority: Authority, at: Date): boolean {
  return !authority.assignments.some((a) => isCurrentlyValid(a, at));
}

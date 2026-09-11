/**
 * Scope containment. Pure: no database, no framework.
 *
 * AD-1 and BR-14. Department scope implies its programs and sections. Containment
 * is evaluated against the organisational tree at request time; a flattened scope
 * list is never stored, because it is stale the moment a section is created.
 */

export type ScopeType =
  | 'institution'
  | 'campus'
  | 'department'
  | 'program'
  | 'section'
  | 'committee'
  | 'self';

export interface Scope {
  type: ScopeType;
  refId: string | null;
}

/**
 * Ancestry of the target, nearest first, as read from the organisational tree.
 * e.g. a section target yields [section, program, department, campus].
 */
export interface ScopeAncestry {
  type: ScopeType;
  refId: string;
}

export const institutionScope = (): Scope => ({ type: 'institution', refId: null });

/**
 * Does `granted` reach `target`?
 *
 * Institution scope reaches everything inside its tenant. Tenancy itself is not
 * checked here: it is enforced by the transaction's tenant context and again by
 * row level security, per AD-22. This function answers the question one layer in.
 */
export function scopeContains(
  granted: Scope,
  target: Scope,
  targetAncestry: readonly ScopeAncestry[],
): boolean {
  if (granted.type === 'institution') return true;

  if (granted.refId === null) return false;

  if (granted.type === target.type && granted.refId === target.refId) return true;

  return targetAncestry.some(
    (a) => a.type === granted.type && a.refId === granted.refId,
  );
}

/** `self` scope grants a person authority over their own record only. */
export function isSelfScopeMatch(granted: Scope, actorPersonId: string, subjectPersonId: string): boolean {
  return granted.type === 'self' && actorPersonId === subjectPersonId;
}

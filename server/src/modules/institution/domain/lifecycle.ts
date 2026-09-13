/**
 * A college's lifecycle, as the platform sees it (SA-1).
 *
 * The database trigger in migration 019 is the authority on which transitions
 * are legal. These functions exist so the application can explain a refusal
 * before asking, and so the access rule below is written exactly once.
 */
import { fail, type Failure } from '../../../core/errors.ts';

export type InstitutionStatus = 'trial' | 'active' | 'suspended' | 'closed';
export type LifecycleAction = 'suspend' | 'reactivate' | 'close';

/** The status an action leads to, or null when it is not available now. */
export function targetOf(
  action: LifecycleAction,
  current: InstitutionStatus,
  suspendedFrom: 'trial' | 'active' | null,
): InstitutionStatus | null {
  switch (action) {
    case 'suspend':
      return current === 'trial' || current === 'active' ? 'suspended' : null;
    case 'reactivate':
      return current === 'suspended' ? suspendedFrom : null;
    case 'close':
      return current === 'closed' ? null : 'closed';
  }
}

export function availableActions(
  current: InstitutionStatus,
  suspendedFrom: 'trial' | 'active' | null,
): LifecycleAction[] {
  return (['suspend', 'reactivate', 'close'] as const).filter(
    (a) => targetOf(a, current, suspendedFrom) !== null,
  );
}

/**
 * OD-SA-1, resolved as AD-60: a suspended or closed college's users are
 * refused entirely. Null means access is allowed. The one place this rule is
 * written; the request boundary and session renewal both call it.
 */
export function accessDenial(status: InstitutionStatus | null): Failure | null {
  if (status === 'suspended') {
    return fail('TENANT_SUSPENDED', 'Access to this college is suspended. Contact your college administrator.');
  }
  if (status === 'closed') {
    return fail('TENANT_SUSPENDED', 'This college is closed.');
  }
  return null;
}

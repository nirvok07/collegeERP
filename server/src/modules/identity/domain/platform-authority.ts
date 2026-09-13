/**
 * What each platform role may do (SA-3a). The one place this is written; code
 * asks for a permission, never compares a role name.
 *
 * | Permission              | Owner | Support |
 * |-------------------------|-------|---------|
 * | platform.colleges.read  |   ✓   |    ✓    |
 * | platform.colleges.manage|   ✓   |         |
 * | platform.audit.read     |   ✓   |         |
 * | platform.accounts.read  |   ✓   |         |
 * | platform.accounts.manage|   ✓   |         |
 * | platform.roles.manage   |   ✓   |         |
 *
 * Support reads colleges to help them and nothing else yet. SA-5 adds its
 * impersonation permission. W0 names the Owner as the only actor who may
 * provision, and the M1 matrix gives platform audit to the Owner alone.
 */
export const PLATFORM_ROLES = ['owner', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type PlatformPermission =
  | 'platform.colleges.read'
  | 'platform.colleges.manage'
  | 'platform.audit.read'
  | 'platform.accounts.read'
  | 'platform.accounts.manage'
  | 'platform.roles.manage';

const MATRIX: Record<PlatformRole, readonly PlatformPermission[]> = {
  owner: [
    'platform.colleges.read', 'platform.colleges.manage', 'platform.audit.read',
    'platform.accounts.read', 'platform.accounts.manage', 'platform.roles.manage',
  ],
  support: ['platform.colleges.read'],
};

export const isPlatformRole = (value: unknown): value is PlatformRole =>
  typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);

/** An account with no active role holds no permission at all. */
export function platformPermissions(role: PlatformRole | null): Set<PlatformPermission> {
  return new Set(role ? MATRIX[role] : []);
}

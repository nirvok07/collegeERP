/**
 * Platform accounts and roles (SA-3a). Pure, so it is tested without a browser.
 * What the viewer may do to an account is the server's answer (`actions`).
 */
export type PlatformRole = 'owner' | 'support';
export type AccountStatus = 'invited' | 'active' | 'suspended' | 'deactivated';
export type AccountAction = 'disable' | 'enable' | 'change_role';

export interface PlatformAccount {
  id: string;
  email: string;
  full_name: string;
  status: AccountStatus;
  role: PlatformRole | null;
  last_login_at: string | null;
  created_at: string;
  is_you: boolean;
}

export interface PlatformAccountDetail extends PlatformAccount {
  actions: AccountAction[];
  role_history: { role: PlatformRole; granted_at: string; ended_at: string | null; reason: string | null }[];
}

export const ROLES: PlatformRole[] = ['owner', 'support'];

export const ROLE_LABEL: Record<PlatformRole, string> = { owner: 'Owner', support: 'Support' };

export const ROLE_SUMMARY: Record<PlatformRole, string> = {
  owner: 'Manages colleges, platform accounts, roles and the audit trail.',
  support: 'Can look up colleges to help them. Cannot change a college or manage accounts.',
};

export const STATUS_LABEL: Record<AccountStatus, string> = {
  invited: 'Waiting for enrolment',
  active: 'Active',
  suspended: 'Disabled',
  deactivated: 'Deactivated',
};

export const STATUS_TONE: Record<AccountStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  invited: 'info', active: 'success', suspended: 'warning', deactivated: 'neutral',
};

export interface NewAccountForm {
  full_name: string;
  email: string;
  role: PlatformRole | '';
}

/** Guidance while typing; the server checks the same and more. */
export function validateNewAccount(form: NewAccountForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.full_name.trim().length < 2) errors.full_name = 'Enter the person’s name';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (!form.role) errors.role = 'Choose a role';
  return errors;
}

export const STATUS_COPY: Record<'disable' | 'enable', {
  button: string; title: string; body: string; confirmLabel: string; danger: boolean;
}> = {
  disable: {
    button: 'Disable',
    title: 'Disable this account',
    body: 'They are signed out on their next action and cannot sign in until an Owner enables the account again.',
    confirmLabel: 'Disable account',
    danger: true,
  },
  enable: {
    button: 'Enable',
    title: 'Enable this account',
    body: 'They can sign in again with their existing credentials.',
    confirmLabel: 'Enable account',
    danger: false,
  },
};

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

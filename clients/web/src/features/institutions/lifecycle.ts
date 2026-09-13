/**
 * The platform's view of one college (SA-1). Pure, so it is tested without a
 * browser. Which actions exist is the server's answer, not computed here.
 */
export type LifecycleAction = 'suspend' | 'reactivate' | 'close';
export type InvitationState = 'pending' | 'expired' | 'accepted' | 'revoked' | 'none';

export interface InstitutionDetail {
  id: string;
  code: string;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'closed';
  suspended_from: 'trial' | 'active' | null;
  plan: string;
  seat_limit: number;
  timezone: string;
  version: number;
  created_at: string | null;
  status_changed_at: string | null;
  actions: LifecycleAction[];
  administrator: {
    full_name: string;
    email: string | null;
    account_status: string;
    invitation: { state: InvitationState; expires_at: string | null };
    can_reissue: boolean;
  } | null;
}

export interface ActionCopy {
  button: string;
  title: string;
  body: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  danger: boolean;
}

export const ACTION_COPY: Record<LifecycleAction, ActionCopy> = {
  suspend: {
    button: 'Suspend',
    title: 'Suspend this college',
    body: 'Everyone at the college is signed out on their next action and cannot sign in until it is reactivated. Nothing is deleted.',
    label: 'Reason',
    placeholder: 'For example: invoice unpaid after the second reminder',
    confirmLabel: 'Suspend college',
    danger: true,
  },
  reactivate: {
    button: 'Reactivate',
    title: 'Reactivate this college',
    body: 'People can sign in again, and sessions that were stopped resume.',
    label: 'Reason',
    placeholder: 'For example: invoice paid',
    confirmLabel: 'Reactivate college',
    danger: false,
  },
  close: {
    button: 'Close college',
    title: 'Close this college',
    body: 'Closing is final. Nobody at the college can sign in again, and it cannot be reopened. What happens to its data is decided separately.',
    label: 'Reason',
    placeholder: 'For example: contract ended on 31 March',
    confirmLabel: 'Close permanently',
    danger: true,
  },
};

export function invitationSummary(admin: InstitutionDetail['administrator']): string {
  if (!admin) return 'No administrator';
  switch (admin.invitation.state) {
    case 'accepted': return 'Accepted';
    case 'pending': return `Waiting, expires ${formatWhen(admin.invitation.expires_at)}`;
    case 'expired': return 'Expired without being accepted';
    case 'revoked': return 'Replaced by a newer invitation';
    case 'none': return 'Never issued';
  }
}

export function reactivationNote(d: InstitutionDetail): string | null {
  return d.status === 'suspended' && d.suspended_from
    ? `Reactivating returns it to ${d.suspended_from}.`
    : null;
}

/** Closing is confirmed by typing the code; the server checks the same. */
export const confirmCodeMatches = (typed: string, code: string) => typed.trim().toLowerCase() === code;

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Not recorded';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

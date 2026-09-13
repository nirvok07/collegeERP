/**
 * The platform audit view (SA-2, AD-61). Pure, so it is tested without a
 * browser. The server decides what is visible and redacts; this only shapes it.
 */
export interface AuditEvent {
  id: string;
  at: string;
  correlation_id: string;
  college: { id: string; code: string | null; name: string | null } | null;
  actor: { id: string; name: string | null; email: string | null } | null;
  action: string;
  subject: { type: string; id: string | null };
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface AuditPageData {
  events: AuditEvent[];
  next_cursor: string | null;
}

/** Dates as the inputs hold them, YYYY-MM-DD; empty means no bound. */
export interface AuditFilters {
  college: string;
  action: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: AuditFilters = { college: '', action: '', from: '', to: '' };
export const PAGE_SIZE = 50;

/** The events a platform account causes today. Anything else still lists, by its code. */
export const PLATFORM_ACTIONS: { value: string; label: string }[] = [
  { value: 'institution.provisioned', label: 'College provisioned' },
  { value: 'institution.suspended', label: 'College suspended' },
  { value: 'institution.reactivated', label: 'College reactivated' },
  { value: 'institution.closed', label: 'College closed' },
  { value: 'invitation.reissued', label: 'Invitation reissued' },
  { value: 'person.created', label: 'Administrator created' },
  { value: 'account.invited', label: 'Administrator invited' },
  { value: 'assignment.granted', label: 'Administrator role granted' },
  { value: 'platform_account.created', label: 'Platform account created' },
  { value: 'platform_account.disabled', label: 'Platform account disabled' },
  { value: 'platform_account.enabled', label: 'Platform account enabled' },
  { value: 'platform_role.assigned', label: 'Platform role assigned' },
  { value: 'platform_role.changed', label: 'Platform role changed' },
  { value: 'platform_account.invitation_issued', label: 'Platform invitation issued' },
  { value: 'platform_account.invitation_accepted', label: 'Platform invitation accepted' },
  { value: 'platform_account.mfa_enrolment_started', label: 'Authenticator setup started' },
  { value: 'platform_account.mfa_enrolled', label: 'Authenticator set up' },
  { value: 'platform_account.mfa_reset', label: 'Authenticator reset by an Owner' },
  { value: 'platform_account.mfa_break_glass_reset', label: 'Authenticator reset by operator (break-glass)' },
  { value: 'auth.signed_in', label: 'Signed in' },
  { value: 'auth.signed_out', label: 'Signed out' },
];

export function actionLabel(action: string): string {
  return PLATFORM_ACTIONS.find((a) => a.value === action)?.label ?? action;
}

/** A day typed in the viewer's own calendar, as the instant it starts. */
function dayStart(date: string, addDays = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d! + addDays).toISOString();
}

/** The "to" day is inclusive, so the bound sent is the start of the next day. */
export function auditPath(filters: AuditFilters, cursor?: string | null, limit = PAGE_SIZE): string {
  const q = new URLSearchParams();
  if (filters.college) q.set('college', filters.college);
  if (filters.action) q.set('action', filters.action);
  if (filters.from) q.set('from', dayStart(filters.from));
  if (filters.to) q.set('to', dayStart(filters.to, 1));
  if (cursor) q.set('cursor', cursor);
  q.set('limit', String(limit));
  return `/v1/platform/audit?${q.toString()}`;
}

export function rangeError(filters: AuditFilters): string | null {
  return filters.from && filters.to && filters.from > filters.to
    ? 'The start date must be on or before the end date.'
    : null;
}

export const isFiltering = (f: AuditFilters) => Boolean(f.college || f.action || f.from || f.to);

/** One line for the table: a status change reads as "trial → suspended". */
export function changeSummary(e: AuditEvent): string | null {
  const before = e.before as { status?: unknown } | null;
  const after = e.after as { status?: unknown } | null;
  if (before && after && typeof before.status === 'string' && typeof after.status === 'string') {
    return `${before.status} → ${after.status}`;
  }
  return null;
}

const SENSITIVE_KEY = /token|password|secret|credential|hash/i;

/** Flattened payload for the detail row. Sensitive keys are dropped here too. */
export function detailEntries(e: AuditEvent): [string, string][] {
  const out: [string, string][] = [];
  const walk = (prefix: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(k)) continue;
        walk(prefix ? `${prefix}.${k}` : k, v);
      }
      return;
    }
    if (typeof value === 'string' && value === '[redacted]') return;
    out.push([prefix, Array.isArray(value) ? value.join(', ') : String(value)]);
  };
  walk('before', e.before);
  walk('after', e.after);
  return out;
}

export function formatAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/**
 * SA-2: the platform's read of its own audit trail (AD-61).
 *
 * Read-only, platform-only, and limited to events a platform account caused.
 * Keyset pagination, newest first, so events arriving while someone pages
 * never shift a page. Reading the trail is not itself audited: no policy asks
 * for it, and it would only add noise to the thing being read.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';

export interface PlatformAuditFilter {
  tenantId: string | null;
  action: string | null;
  from: string | null;
  to: string | null;
  before: { at: string; id: string } | null;
  limit: number;
}

export interface PlatformAuditRow {
  id: string;
  at: Date;
  cursorAt: string;
  correlationId: string;
  college: { id: string; code: string | null; name: string | null } | null;
  actor: { id: string; name: string | null; email: string | null } | null;
  action: string;
  subject: { type: string; id: string | null };
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface PlatformAuditReader {
  list(tx: Tx, filter: PlatformAuditFilter): Promise<PlatformAuditRow[]>;
}

export interface PlatformAuditDeps {
  uow: UnitOfWork;
  platformAudit: PlatformAuditReader;
}

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 100;

export function encodeCursor(row: Pick<PlatformAuditRow, 'cursorAt' | 'id'>): string {
  return Buffer.from(`${row.cursorAt}|${row.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { at: string; id: string } | null {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const [at, id, extra] = text.split('|');
  if (extra !== undefined || !at || !id) return null;
  if (!/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(Date.parse(at.replace(' ', 'T')))) return null;
  return { at, id };
}

/**
 * Defence in depth. No writer puts secrets in an audit payload today; if one
 * ever did, the platform view still would not show it.
 */
const SENSITIVE_KEY = /token|password|secret|credential|hash/i;
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k, SENSITIVE_KEY.test(k) ? '[redacted]' : redactSensitive(v),
      ]),
    );
  }
  return value;
}

export async function listPlatformAudit(
  deps: PlatformAuditDeps,
  input: {
    tenantId?: string | null;
    action?: string | null;
    from?: string | null;
    to?: string | null;
    cursor?: string | null;
    limit?: number | null;
  },
): Promise<Result<{ rows: PlatformAuditRow[]; nextCursor: string | null }>> {
  const limit = input.limit ?? DEFAULT_PAGE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
    return Err(fail('VALIDATION_FAILED', `Ask for between 1 and ${MAX_PAGE} events at a time.`));
  }
  if (input.from && input.to && Date.parse(input.from) >= Date.parse(input.to)) {
    return Err(fail('VALIDATION_FAILED', 'The start of the range must be before its end.'));
  }
  const before = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !before) return Err(fail('VALIDATION_FAILED', 'That page link is not valid.'));

  const fetched = await deps.uow.run(null, (tx) => deps.platformAudit.list(tx, {
    tenantId: input.tenantId ?? null,
    action: input.action ?? null,
    from: input.from ?? null,
    to: input.to ?? null,
    before,
    limit: limit + 1,
  }));
  const rows = fetched.slice(0, limit).map((r) => ({
    ...r, before: redactSensitive(r.before), after: redactSensitive(r.after),
  }));
  const nextCursor = fetched.length > limit ? encodeCursor(rows[rows.length - 1]!) : null;
  return Ok({ rows, nextCursor });
}

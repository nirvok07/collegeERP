import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS, actionLabel, auditPath, changeSummary, detailEntries, isFiltering, rangeError,
  type AuditEvent,
} from './audit.ts';

const event = (over: Partial<AuditEvent> = {}): AuditEvent => ({
  id: 'e1', at: '2026-09-13T10:00:00.000Z', correlation_id: 'c1',
  college: { id: 'i1', code: 'test-college', name: 'Test College' },
  actor: { id: 'p1', name: 'Platform Owner', email: 'owner@nirvok.com' },
  action: 'institution.suspended', subject: { type: 'institution', id: 'i1' },
  before: { status: 'trial' }, after: { status: 'suspended' }, reason: 'Unpaid invoice',
  ...over,
});

describe('the audit query', () => {
  it('sends only the filters in use, a page size, and the cursor', () => {
    const path = auditPath({ ...EMPTY_FILTERS, college: 'i1', action: 'institution.closed' }, 'abc');
    const q = new URL(path, 'http://x').searchParams;
    expect(q.get('college')).toBe('i1');
    expect(q.get('action')).toBe('institution.closed');
    expect(q.get('cursor')).toBe('abc');
    expect(q.get('limit')).toBe('50');
    expect(q.has('from')).toBe(false);
  });

  it('treats the end date as inclusive by sending the start of the next day', () => {
    const q = new URL(auditPath({ ...EMPTY_FILTERS, from: '2026-09-01', to: '2026-09-01' }), 'http://x').searchParams;
    const from = new Date(q.get('from')!);
    const to = new Date(q.get('to')!);
    expect(to.getTime() - from.getTime()).toBe(24 * 3_600_000);
    expect(from.getDate()).toBe(1);
  });

  it('refuses a backwards range before asking the server', () => {
    expect(rangeError({ ...EMPTY_FILTERS, from: '2026-09-02', to: '2026-09-01' })).toMatch(/on or before/);
    expect(rangeError({ ...EMPTY_FILTERS, from: '2026-09-01', to: '2026-09-01' })).toBeNull();
  });

  it('knows when anything is filtered', () => {
    expect(isFiltering(EMPTY_FILTERS)).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTERS, to: '2026-09-01' })).toBe(true);
  });
});

describe('an event, as shown', () => {
  it('names known actions in words and leaves unknown ones as their code', () => {
    expect(actionLabel('institution.suspended')).toBe('College suspended');
    expect(actionLabel('something.new')).toBe('something.new');
  });

  it('summarises a status change in one line', () => {
    expect(changeSummary(event())).toBe('trial → suspended');
    expect(changeSummary(event({ before: null, after: { code: 'x' } }))).toBeNull();
  });

  it('never renders a sensitive key, even if the server sent one', () => {
    const entries = detailEntries(event({
      after: { status: 'suspended', token: 'abc', nested: { refreshToken: 'def', ok: 'yes' }, masked: '[redacted]' },
    }));
    const text = JSON.stringify(entries);
    expect(text).not.toMatch(/abc|def|token|redacted/i);
    expect(entries).toContainEqual(['after.status', 'suspended']);
    expect(entries).toContainEqual(['after.nested.ok', 'yes']);
  });
});

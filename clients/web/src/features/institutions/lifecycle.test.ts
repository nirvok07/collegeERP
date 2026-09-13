import { describe, expect, it } from 'vitest';
import {
  ACTION_COPY, confirmCodeMatches, invitationSummary, reactivationNote, type InstitutionDetail,
} from './lifecycle.ts';

const detail = (over: Partial<InstitutionDetail> = {}): InstitutionDetail => ({
  id: 'i1', code: 'test-college', name: 'Test College', status: 'trial', suspended_from: null,
  plan: 'standard', seat_limit: 500, timezone: 'Asia/Kolkata', version: 1,
  created_at: '2026-09-01T10:00:00.000Z', status_changed_at: null, actions: ['suspend', 'close'],
  administrator: {
    full_name: 'Priya Sharma', email: 'priya@testcollege.edu', account_status: 'invited',
    invitation: { state: 'pending', expires_at: '2026-09-20T10:00:00.000Z' }, can_reissue: true,
  },
  ...over,
});

describe('college lifecycle copy', () => {
  it('asks for a reason on every action and marks the destructive ones', () => {
    for (const copy of Object.values(ACTION_COPY)) expect(copy.label).toBe('Reason');
    expect(ACTION_COPY.suspend.danger).toBe(true);
    expect(ACTION_COPY.close.danger).toBe(true);
    expect(ACTION_COPY.reactivate.danger).toBe(false);
  });

  it('says plainly that closing is final and does not promise anything about data', () => {
    expect(ACTION_COPY.close.body).toMatch(/final/);
    expect(ACTION_COPY.close.body).toMatch(/decided separately/);
  });

  it('says what suspension does to people who are signed in', () => {
    expect(ACTION_COPY.suspend.body).toMatch(/signed out on their next action/);
  });
});

describe('the administrator invitation', () => {
  it('describes every state in words', () => {
    const admin = detail().administrator!;
    expect(invitationSummary(admin)).toMatch(/^Waiting, expires/);
    expect(invitationSummary({ ...admin, invitation: { state: 'accepted', expires_at: null } })).toBe('Accepted');
    expect(invitationSummary({ ...admin, invitation: { state: 'expired', expires_at: null } })).toMatch(/Expired/);
    expect(invitationSummary({ ...admin, invitation: { state: 'revoked', expires_at: null } })).toMatch(/Replaced/);
    expect(invitationSummary(null)).toBe('No administrator');
  });
});

describe('reactivation', () => {
  it('names the status a suspended college returns to', () => {
    expect(reactivationNote(detail({ status: 'suspended', suspended_from: 'active' }))).toBe('Reactivating returns it to active.');
    expect(reactivationNote(detail())).toBeNull();
  });
});

describe('closing confirmation', () => {
  it('matches the college code, ignoring case and surrounding space', () => {
    expect(confirmCodeMatches(' Test-College ', 'test-college')).toBe(true);
    expect(confirmCodeMatches('test', 'test-college')).toBe(false);
  });
});

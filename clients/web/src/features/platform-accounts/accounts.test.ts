import { describe, expect, it } from 'vitest';
import {
  ROLE_LABEL, ROLE_SUMMARY, STATUS_COPY, STATUS_LABEL, formatWhen, validateNewAccount,
} from './accounts.ts';

describe('platform roles, as shown', () => {
  it('names both roles and says plainly what Support cannot do', () => {
    expect(ROLE_LABEL.owner).toBe('Owner');
    expect(ROLE_LABEL.support).toBe('Support');
    expect(ROLE_SUMMARY.support).toMatch(/Cannot change a college or manage accounts/);
  });

  it('calls a new account waiting for enrolment, not active', () => {
    expect(STATUS_LABEL.invited).toBe('Waiting for enrolment');
    expect(STATUS_LABEL.suspended).toBe('Disabled');
  });

  it('marks disabling as the destructive action and says what it does to a signed-in person', () => {
    expect(STATUS_COPY.disable.danger).toBe(true);
    expect(STATUS_COPY.enable.danger).toBe(false);
    expect(STATUS_COPY.disable.body).toMatch(/signed out on their next action/);
  });
});

describe('creating an account', () => {
  it('asks for a name, a valid email and a role', () => {
    expect(validateNewAccount({ full_name: '', email: 'x', role: '' })).toEqual({
      full_name: expect.any(String), email: expect.any(String), role: expect.any(String),
    });
    expect(validateNewAccount({ full_name: 'Asha Rao', email: 'asha@nirvok.com', role: 'support' })).toEqual({});
  });
});

describe('dates', () => {
  it('says "Never" for an account that has never signed in', () => {
    expect(formatWhen(null)).toBe('Never');
  });
});

import { MFA_LABEL, MFA_RESET_COPY, invitationLink } from './accounts.ts';

describe('the authenticator', () => {
  it('shows whether it is set up, and says a reset never switches it off', () => {
    expect(MFA_LABEL.enrolled).toBe('Set up');
    expect(MFA_LABEL.enrolment_required).toBe('Not set up');
    expect(MFA_RESET_COPY.body).toMatch(/never switched off/);
  });

  it('builds the invitation link to the setup page', () => {
    expect(invitationLink('https://admin.example', 'abc/def')).toBe('https://admin.example/platform/enrol?token=abc%2Fdef');
  });
});

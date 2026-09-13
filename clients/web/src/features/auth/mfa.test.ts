import { describe, expect, it } from 'vitest';
import { formatManualKey, invitationTokenFrom, isCompleteCode, isExpiredStep, normaliseCode } from './mfa.ts';

describe('typing a code', () => {
  it('keeps only six digits, whatever was pasted', () => {
    expect(normaliseCode(' 123 456 ')).toBe('123456');
    expect(normaliseCode('12-34-567')).toBe('123456');
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('123456')).toBe(true);
  });
});

describe('the manual key', () => {
  it('reads in groups of four', () => {
    expect(formatManualKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });
});

describe('an expired step', () => {
  it('is recognised from the server message', () => {
    expect(isExpiredStep('This sign-in has expired. Start again.')).toBe(true);
    expect(isExpiredStep('That code is not correct.')).toBe(false);
  });
});

describe('the invitation link', () => {
  it('reads the token and refuses anything too short to be one', () => {
    expect(invitationTokenFrom('?token=abcdefghijklmnop')).toBe('abcdefghijklmnop');
    expect(invitationTokenFrom('?token=x')).toBeNull();
    expect(invitationTokenFrom('')).toBeNull();
  });
});

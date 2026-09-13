import { describe, expect, it } from 'vitest';
import { acceptFormError, collegeInviteFrom } from './collegeInvite.ts';

describe('college invitation (WEB-1)', () => {
  it('reads the college and token from the link the console issues', () => {
    expect(collegeInviteFrom('?college=IIT-Doon&token=abc123')).toEqual({ college: 'iit-doon', token: 'abc123' });
    expect(collegeInviteFrom('')).toEqual({ college: '', token: '' });
  });

  it('names the first obvious problem, and none for a good form', () => {
    const good = { college: 'iit-doon', token: 'abc', password: 'strong-pass-9', again: 'strong-pass-9' };
    expect(acceptFormError(good)).toBeNull();
    expect(acceptFormError({ ...good, college: ' ' })).toMatch(/college code/);
    expect(acceptFormError({ ...good, token: '' })).toMatch(/invitation code/);
    expect(acceptFormError({ ...good, password: 'short1', again: 'short1' })).toMatch(/ten characters/);
    expect(acceptFormError({ ...good, password: 'onlyletters', again: 'onlyletters' })).toMatch(/number/);
    expect(acceptFormError({ ...good, again: 'different-9' })).toMatch(/do not match/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, readSession, writeSession, type StoredSession } from './session.ts';

const session = (expiresAt: string): StoredSession => ({
  accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: expiresAt,
  actor: { actorId: 'p1', fullName: 'Platform Owner', actorType: 'platform' },
});

const future = () => new Date(Date.now() + 600_000).toISOString();
const past = () => new Date(Date.now() - 600_000).toISOString();

describe('session store', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

  it('round-trips a live session', () => {
    writeSession(session(future()));
    expect(readSession()?.actor.fullName).toBe('Platform Owner');
  });

  it('treats an expired session as absent', () => {
    writeSession(session(past()));
    expect(readSession()).toBeNull();
  });

  it('returns null rather than throwing on corrupt storage', () => {
    sessionStorage.setItem('college-erp.session.v1', 'not json');
    expect(readSession()).toBeNull();
  });

  it('survives storage being unavailable, as in a private window', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readSession()).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => writeSession(session(future()))).not.toThrow();
  });

  it('clears on sign out', () => {
    writeSession(session(future()));
    clearSession();
    expect(readSession()).toBeNull();
  });
});

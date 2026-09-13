import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from './auth.ts';

/**
 * The rule under test: the user is not signed out while still working.
 * A transient failure must keep the session; only a refused renewal ends it.
 */

const tokenBody = (expiresInMs = 900_000) => ({
  data: {
    actor: { actor_type: 'platform', actor_id: 'p1', full_name: 'Surya Pandey', tenant_id: null },
    access_token: `token-${Math.random()}`,
    access_token_expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  },
});

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe('AuthSession', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('signs in and holds the access token in memory only', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    const result = await auth.verifySecondFactor('challenge-token', '123456');

    expect(result.ok).toBe(true);
    expect(auth.accessToken()).toBeTruthy();
    expect(auth.currentActor()?.fullName).toBe('Surya Pandey');
    // Nothing sensitive is written to browser storage.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('SA-3b: a password alone yields the next step and holds no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { step: 'second_factor', challenge_token: 'challenge-token' } }));
    const auth = new AuthSession('http://api.test');
    const result = await auth.signIn('a@b.com', 'password-1');
    expect(result).toEqual({ ok: true, step: 'second_factor', challenge: 'challenge-token' });
    expect(auth.accessToken()).toBeNull();
    expect(auth.currentActor()).toBeNull();
  });

  it('sends credentials so the httpOnly refresh cookie travels', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    await new AuthSession('http://api.test').verifySecondFactor('challenge-token', '123456');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'include' });
  });

  it('restores a session on startup without the user signing in', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    expect(await auth.restore()).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toContain('/v1/auth/refresh');
  });

  it('does NOT sign the user out when the network is down', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');

    const events: string[] = [];
    auth.subscribe((e) => events.push(e.type));

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await auth.renew()).toBe(false);

    expect(events).toContain('degraded');
    expect(events).not.toContain('signed-out');
    expect(auth.currentActor()).not.toBeNull();
  });

  it('does NOT sign the user out when the server returns 500', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');

    const events: string[] = [];
    auth.subscribe((e) => events.push(e.type));

    fetchMock.mockResolvedValue(jsonResponse(503, { error: { code: 'UNKNOWN', message: 'down' } }));
    await auth.renew();

    expect(events).toContain('degraded');
    expect(events).not.toContain('signed-out');
  });

  it('retries after a transient failure and recovers without user action', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    const events: string[] = [];
    auth.subscribe((e) => events.push(e.type));

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await auth.renew();
    expect(events).toContain('degraded');

    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    await vi.advanceTimersByTimeAsync(2_500);
    expect(events).toContain('recovered');
    expect(auth.currentActor()).not.toBeNull();
  });

  it('signs the user out only when the server refuses the renewal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    const events: Array<{ type: string }> = [];
    auth.subscribe((e) => events.push(e));

    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Your session has ended.' } }),
    );
    expect(await auth.renew()).toBe(false);

    expect(events.some((e) => e.type === 'signed-out')).toBe(true);
    expect(auth.currentActor()).toBeNull();
    expect(auth.accessToken()).toBeNull();
  });

  it('renews ahead of expiry so the user never meets an expired token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody(120_000)));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Expiry is 120s away and the margin is 60s, so renewal fires around 60s.
    await vi.advanceTimersByTimeAsync(61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain('/v1/auth/refresh');
  });

  it('collapses concurrent renewals into one request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    fetchMock.mockClear();

    await Promise.all([auth.renew(), auth.renew(), auth.renew(), auth.renew()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an expired token as absent so callers renew first', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody(-1_000)));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    expect(auth.accessToken()).toBeNull();
  });

  it('clears local state on explicit sign out', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    await auth.signOut();
    expect(auth.currentActor()).toBeNull();
    expect(auth.accessToken()).toBeNull();
  });

  it('still clears local state when the sign-out request itself fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, tokenBody()));
    const auth = new AuthSession('http://api.test');
    await auth.verifySecondFactor('challenge-token', '123456');
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await auth.signOut();
    expect(auth.currentActor()).toBeNull();
  });
});

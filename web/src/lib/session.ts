/**
 * Session storage for the console.
 *
 * Tokens live in memory, with only enough in sessionStorage to survive a page
 * reload. sessionStorage rather than localStorage because a shared office
 * machine must not keep a platform session across browser sessions, and every
 * access is wrapped because storage throws in a private window.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  actor: { actorId: string; fullName: string; actorType: 'platform' | 'person' };
}

const KEY = 'college-erp.session.v1';

export function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || !parsed?.actor) return null;
    if (new Date(parsed.accessTokenExpiresAt).getTime() < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // A session that cannot be persisted still works for this page.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

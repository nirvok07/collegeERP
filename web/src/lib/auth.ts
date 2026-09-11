/**
 * Session management for the console.
 *
 * The rules this exists to satisfy:
 *   - the user is never signed out while still working
 *   - a browser refresh does not sign them out
 *   - a temporary network failure does not sign them out
 *   - only an unrenewable session, an explicit sign-out, or a revoked
 *     credential ends the session
 *
 * Storage strategy: the access token lives in memory only, and the refresh
 * token lives in an httpOnly cookie the browser attaches automatically. Neither
 * is in localStorage, so an XSS bug cannot read either one. The cost is that a
 * new tab starts by calling refresh, which is a single request.
 */
import type { ApiFailure } from './api.ts';

export interface Actor {
  actorId: string;
  fullName: string;
  actorType: 'platform' | 'person';
  tenantId: string | null;
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

export type AuthEvent =
  | { type: 'signed-in'; actor: Actor }
  | { type: 'signed-out'; reason: 'user' | 'session-ended' }
  | { type: 'degraded'; failure: ApiFailure }
  | { type: 'recovered' };

/** Renew this many ms before expiry, so a request never races the clock. */
const RENEW_MARGIN_MS = 60_000;
/** Backoff for transient failures. The session is kept throughout. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

interface RawTokens {
  actor: { actor_type: 'platform' | 'person'; actor_id: string; full_name: string; tenant_id: string | null };
  access_token: string;
  access_token_expires_at: string;
}

export class AuthSession {
  private tokens: TokenState | null = null;
  private actor: Actor | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private inFlight: Promise<boolean> | null = null;
  private readonly listeners = new Set<(e: AuthEvent) => void>();

  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  subscribe(listener: (e: AuthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AuthEvent) {
    for (const l of this.listeners) l(event);
  }

  currentActor(): Actor | null {
    return this.actor;
  }

  /** Null when the token is missing or about to expire; callers then renew. */
  accessToken(): string | null {
    if (!this.tokens) return null;
    return this.tokens.expiresAt - Date.now() > 0 ? this.tokens.accessToken : null;
  }

  /**
   * Called once at startup. The cookie is sent automatically, so a page reload
   * restores the session without the user seeing a sign-in screen.
   */
  async restore(): Promise<boolean> {
    return this.renew();
  }

  async signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; failure: ApiFailure }> {
    const response = await this.call('/v1/auth/platform/login', { email, password });
    if (!response.ok) return { ok: false, failure: response.failure };
    this.adopt(response.data);
    this.emit({ type: 'signed-in', actor: this.actor! });
    return { ok: true };
  }

  async signOut(): Promise<void> {
    this.clearTimer();
    this.tokens = null;
    this.actor = null;
    // Best effort: the local session is already gone, so a failure here must not
    // leave the user staring at a screen they have logically left.
    await this.call('/v1/auth/logout', {}).catch(() => undefined);
    this.emit({ type: 'signed-out', reason: 'user' });
  }

  /**
   * Renews the access token. Single-flight: ten concurrent 401s trigger one
   * renewal, not ten, and all of them wait on the same promise.
   */
  renew(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performRenew().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async performRenew(): Promise<boolean> {
    const response = await this.call('/v1/auth/refresh', {});

    if (response.ok) {
      this.adopt(response.data);
      if (this.retryIndex > 0) {
        this.retryIndex = 0;
        this.emit({ type: 'recovered' });
      }
      return true;
    }

    // A transient failure keeps the session. Signing the user out because the
    // wifi dropped for four seconds is exactly the behaviour being avoided.
    if (response.transient) {
      this.emit({ type: 'degraded', failure: response.failure });
      this.scheduleRetry();
      return false;
    }

    // The server refused: the token is revoked, replayed or expired beyond
    // renewal. This is the only path that ends a session without the user asking.
    this.clearTimer();
    this.tokens = null;
    this.actor = null;
    this.emit({ type: 'signed-out', reason: 'session-ended' });
    return false;
  }

  private adopt(raw: RawTokens) {
    const expiresAt = new Date(raw.access_token_expires_at).getTime();
    this.tokens = { accessToken: raw.access_token, expiresAt };
    this.actor = {
      actorId: raw.actor.actor_id,
      fullName: raw.actor.full_name,
      actorType: raw.actor.actor_type,
      tenantId: raw.actor.tenant_id ?? null,
    };
    this.scheduleRenew(expiresAt);
  }

  /** Renew ahead of expiry so the user never meets an expired token. */
  private scheduleRenew(expiresAt: number) {
    this.clearTimer();
    const delay = Math.max(5_000, expiresAt - Date.now() - RENEW_MARGIN_MS);
    this.renewTimer = setTimeout(() => void this.renew(), delay);
  }

  private scheduleRetry() {
    this.clearTimer();
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)]!;
    this.retryIndex += 1;
    this.renewTimer = setTimeout(() => void this.renew(), delay);
  }

  private clearTimer() {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.renewTimer = null;
  }

  private async call(
    path: string,
    body: unknown,
  ): Promise<
    | { ok: true; data: RawTokens }
    | { ok: false; failure: ApiFailure; transient: boolean }
  > {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Sends and receives the httpOnly refresh cookie.
        credentials: 'include',
        body: JSON.stringify(body),
      });
    } catch {
      return {
        ok: false,
        transient: true,
        failure: { code: 'NETWORK', message: 'Cannot reach the server. Retrying.' },
      };
    }

    // 5xx is the server having a bad moment, not the session being invalid.
    if (res.status >= 500) {
      return {
        ok: false,
        transient: true,
        failure: { code: 'SERVER', message: 'The server is not responding. Retrying.' },
      };
    }

    let payload: { data?: RawTokens; error?: { code?: string; message?: string } };
    try {
      payload = await res.json();
    } catch {
      return {
        ok: false,
        transient: true,
        failure: { code: 'UNKNOWN', message: 'Unexpected response. Retrying.' },
      };
    }

    if (!res.ok || !payload.data) {
      return {
        ok: false,
        transient: false,
        failure: {
          code: payload.error?.code ?? 'UNAUTHENTICATED',
          message: payload.error?.message ?? 'Your session has ended. Please sign in again.',
        },
      };
    }

    return { ok: true, data: payload.data };
  }
}

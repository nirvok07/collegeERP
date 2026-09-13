/**
 * Persistent sessions. The user must not be signed out while still working.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, resetData, seedPlatformAccount, setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
  platformSessionResponse,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;

before(async () => {
  await setupDatabase();
  harness = await buildTestApp();
});
after(async () => harness.close());
beforeEach(resetData);

const REFRESH_COOKIE = 'college_erp_rt';

function cookieFrom(res: LightMyRequestResponse): string | undefined {
  const cookies = res.cookies as Array<{ name: string; value: string }>;
  return cookies.find((c) => c.name === REFRESH_COOKIE)?.value;
}

async function signIn() {
  const account = await seedPlatformAccount();
  const res = await platformSessionResponse(harness.app, account.email, account.password);
  assert.equal(res.statusCode, 200);
  return { account, res, cookie: cookieFrom(res)!, body: res.json().data };
}

const refreshWith = (cookie: string) =>
  harness.app.inject({
    method: 'POST', url: '/v1/auth/refresh', cookies: { [REFRESH_COOKIE]: cookie },
  }) as Promise<LightMyRequestResponse>;

describe('persistent session', () => {
  it('sign-in sets an httpOnly refresh cookie that JavaScript cannot read', async () => {
    const { res } = await signIn();
    const cookie = (res.cookies as Array<Record<string, unknown>>).find((c) => c.name === REFRESH_COOKIE);
    assert.ok(cookie, 'a refresh cookie is set');
    assert.equal(cookie!.httpOnly, true, 'an XSS bug must not be able to read it');
    assert.equal(cookie!.sameSite, 'Lax');
    assert.equal(cookie!.path, '/v1/auth', 'not attached to ordinary API calls');
    assert.ok((cookie!.maxAge as number) >= 29 * 86400, 'the session outlives the access token by weeks');
  });

  it('renews the session without the user doing anything', async () => {
    const { cookie, body } = await signIn();
    const refreshed = await refreshWith(cookie);

    assert.equal(refreshed.statusCode, 200);
    assert.ok(refreshed.json().data.access_token);
    assert.notEqual(refreshed.json().data.access_token, body.access_token, 'a new access token is issued');
    assert.equal(refreshed.json().data.actor.actor_type, 'platform');
  });

  it('rotates the refresh token on every renewal', async () => {
    const { cookie } = await signIn();
    const first = await refreshWith(cookie);
    const rotated = cookieFrom(first)!;
    assert.notEqual(rotated, cookie, 'the cookie is replaced, not reused');

    const second = await refreshWith(rotated);
    assert.equal(second.statusCode, 200, 'the successor works');
  });

  it('keeps working across many renewals, so a long session never expires', async () => {
    let cookie = (await signIn()).cookie;
    for (let i = 0; i < 10; i++) {
      const res = await refreshWith(cookie);
      assert.equal(res.statusCode, 200, `renewal ${i + 1} succeeded`);
      cookie = cookieFrom(res)!;
    }
  });

  it('extends expiry on each renewal rather than counting down from sign-in', async () => {
    const { cookie } = await signIn();
    const pool = createPool(MIGRATOR_URL);
    try {
      const before = await pool.query(
        `SELECT expires_at FROM refresh_tokens ORDER BY created_at DESC LIMIT 1`,
      );
      await new Promise((r) => setTimeout(r, 1100));
      await refreshWith(cookie);
      const after = await pool.query(
        `SELECT expires_at FROM refresh_tokens ORDER BY created_at DESC LIMIT 1`,
      );
      assert.ok(
        after.rows[0].expires_at > before.rows[0].expires_at,
        'the window slides forward while the user keeps working',
      );
    } finally {
      await pool.end();
    }
  });

  it('detects replay of a consumed token and revokes the whole family', async () => {
    const { cookie } = await signIn();
    const first = await refreshWith(cookie);
    const rotated = cookieFrom(first)!;

    // An attacker replays the original, already-exchanged token.
    const replay = await refreshWith(cookie);
    assert.equal(replay.statusCode, 401);

    // The legitimate holder's successor is revoked too: theft is assumed.
    const legitimate = await refreshWith(rotated);
    assert.equal(legitimate.statusCode, 401, 'the entire family is revoked');

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT action FROM audit_events WHERE action = 'auth.refresh_token_reuse_detected'`,
      );
      assert.equal(rows.length, 1, 'reuse is audited, not silently handled');
    } finally {
      await pool.end();
    }
  });

  it('clears the cookie when the session cannot be renewed', async () => {
    const res = await harness.app.inject({
      method: 'POST', url: '/v1/auth/refresh', cookies: { [REFRESH_COOKIE]: 'not-a-real-token' },
    }) as LightMyRequestResponse;
    assert.equal(res.statusCode, 401);
    const cleared = (res.cookies as Array<Record<string, unknown>>).find((c) => c.name === REFRESH_COOKIE);
    assert.equal(cleared?.value, '', 'a dead token is not presented again on every request');
  });

  it('refuses renewal once the account is no longer active', async () => {
    const { cookie, account } = await signIn();
    const pool = createPool(MIGRATOR_URL);
    try {
      await pool.query(`UPDATE platform_accounts SET status = 'suspended' WHERE id = $1`, [account.id]);
    } finally {
      await pool.end();
    }
    const res = await refreshWith(cookie);
    assert.equal(res.statusCode, 401, 'revocation reaches an already signed-in user at renewal');
  });

  it('signing out ends the family, so the token cannot be renewed afterwards', async () => {
    const { cookie } = await signIn();
    const out = await harness.app.inject({
      method: 'POST', url: '/v1/auth/logout', cookies: { [REFRESH_COOKIE]: cookie },
    }) as LightMyRequestResponse;
    assert.equal(out.statusCode, 200);

    const after = await refreshWith(cookie);
    assert.equal(after.statusCode, 401);
  });

  it('signing out with no session still succeeds and reveals nothing', async () => {
    const res = await harness.app.inject({ method: 'POST', url: '/v1/auth/logout' }) as LightMyRequestResponse;
    assert.equal(res.statusCode, 200);
  });

  it('accepts a body token so Flutter can renew without cookies', async () => {
    const { cookie } = await signIn();
    const res = await harness.app.inject({
      method: 'POST', url: '/v1/auth/refresh', payload: { refresh_token: cookie },
    }) as LightMyRequestResponse;
    assert.equal(res.statusCode, 200, 'one mechanism, two transports');
    assert.ok(res.json().data.refresh_token, 'mobile receives the successor in the body');
  });

  it('a tenant user session renews with the same mechanism', async () => {
    const account = await seedPlatformAccount();
    const login = await signInPlatform(harness.app, account.email, account.password);
    const prov = (await harness.app.inject({
      method: 'POST', url: '/v1/institutions',
      headers: { authorization: `Bearer ${login.body.data.access_token}` },
      payload: { code: 'river-college', name: 'River College', admin: { full_name: 'Meera Rao', email: 'meera@river.edu' } },
    })) as LightMyRequestResponse;

    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: 'river-college',
        token: prov.json().data.invitation.token,
        password: 'meera-strong-99',
      },
    });
    const signedIn = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: 'river-college', identifier: 'meera@river.edu', password: 'meera-strong-99' },
    })) as LightMyRequestResponse;

    const refreshed = await refreshWith(cookieFrom(signedIn)!);
    assert.equal(refreshed.statusCode, 200);
    assert.equal(refreshed.json().data.actor.actor_type, 'person');
    assert.ok(refreshed.json().data.actor.tenant_id, 'the renewed token stays tenant-scoped');
  });
});

/**
 * Push registration. The ERP decides who is notified; this only records where.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;

before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

async function signedInUser(code = 'device-college', email = 'asha@device.edu') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Device College', adminEmail: email,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'strong-pass-99' },
  });
  const signedIn = (await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: email, password: 'strong-pass-99' },
  })) as LightMyRequestResponse;
  return {
    code,
    token: signedIn.json().data.access_token as string,
    refreshToken: signedIn.json().data.refresh_token as string,
    tenantId: prov.body.data.institution.id as string,
  };
}

const register = (token: string, body: Record<string, unknown>) =>
  harness.app.inject({
    method: 'POST', url: '/v1/devices',
    headers: { authorization: `Bearer ${token}` }, payload: body as never,
  }) as Promise<LightMyRequestResponse>;

const PUSH_TOKEN = 'fcm-token-value-that-is-long-enough';

describe('device registration', () => {
  it('registers a device for the signed-in person', async () => {
    const user = await signedInUser();
    const res = await register(user.token, {
      platform: 'android', push_token: PUSH_TOKEN, app_version: '1.0.0',
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json().data.device_id);
  });

  it('stores the push token hashed, never in the clear', async () => {
    const user = await signedInUser();
    await register(user.token, { platform: 'android', push_token: PUSH_TOKEN });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(`SELECT push_token_hash FROM devices`);
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].push_token_hash, PUSH_TOKEN);
      assert.equal(rows[0].push_token_hash.length, 64, 'a sha-256 digest, not the token');
    } finally { await pool.end(); }
  });

  it('re-registering the same device updates it rather than accumulating rows', async () => {
    const user = await signedInUser();
    const first = await register(user.token, { platform: 'android', push_token: PUSH_TOKEN });
    const second = await register(user.token, {
      platform: 'android', push_token: PUSH_TOKEN, app_version: '1.1.0',
    });

    assert.equal(first.json().data.device_id, second.json().data.device_id);

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(`SELECT app_version FROM devices`);
      assert.equal(rows.length, 1, 'every app launch would otherwise add a row');
      assert.equal(rows[0].app_version, '1.1.0');
    } finally { await pool.end(); }
  });

  it('re-points a shared handset at whoever is signed in now', async () => {
    const first = await signedInUser('shared-college', 'first@shared.edu');
    await register(first.token, { platform: 'android', push_token: PUSH_TOKEN });

    // A second person invited into the same college signs in on that handset.
    const invited = await harness.app.inject({
      method: 'POST', url: '/v1/people',
      headers: { authorization: `Bearer ${first.token}` },
      payload: {
        full_name: 'Second User', email: 'second@shared.edu', person_type: 'staff',
        role: { role_key: 'college_admin', scope_type: 'institution' },
      },
    }) as LightMyRequestResponse;
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: 'shared-college',
        token: invited.json().data.invitation.token, password: 'second-pass-99',
      },
    });
    const secondLogin = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: 'shared-college', identifier: 'second@shared.edu', password: 'second-pass-99' },
    })) as LightMyRequestResponse;

    await register(secondLogin.json().data.access_token, {
      platform: 'android', push_token: PUSH_TOKEN,
    });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT p.full_name FROM devices d JOIN persons p ON p.id = d.person_id
          WHERE d.revoked_at IS NULL`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].full_name, 'Second User',
        'the previous user stops receiving notifications on that handset');
    } finally { await pool.end(); }
  });

  it('signing out revokes the device, so a shared phone leaks nothing', async () => {
    const user = await signedInUser();
    await register(user.token, { platform: 'ios', push_token: PUSH_TOKEN });

    const out = await harness.app.inject({
      method: 'POST', url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { refresh_token: user.refreshToken },
    });
    assert.equal(out.statusCode, 200);

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT revoked_at, revoked_reason FROM devices`,
      );
      assert.ok(rows[0].revoked_at, 'revoked, not deleted, so the register stays readable');
      assert.equal(rows[0].revoked_reason, 'signed_out');
    } finally { await pool.end(); }
  });

  it('signing out with the refresh token alone, as the mobile app does, still revokes the device', async () => {
    // Found on a real phone: the app clears its access token before telling the
    // server, so the logout carries no bearer. The device must still be revoked.
    const user = await signedInUser();
    await register(user.token, { platform: 'android', push_token: PUSH_TOKEN });

    const out = await harness.app.inject({
      method: 'POST', url: '/v1/auth/logout',
      payload: { refresh_token: user.refreshToken },
    });
    assert.equal(out.statusCode, 200);

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(`SELECT revoked_at, revoked_reason FROM devices`);
      assert.ok(rows[0].revoked_at);
      assert.equal(rows[0].revoked_reason, 'signed_out');
      const audit = await pool.query(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'device.revoked'`);
      assert.equal(audit.rows[0].n, 1);
    } finally { await pool.end(); }
  });

  it('an unauthenticated caller cannot register a device', async () => {
    const res = await harness.app.inject({
      method: 'POST', url: '/v1/devices',
      payload: { platform: 'android', push_token: PUSH_TOKEN } as never,
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects an unknown platform and a token that is obviously not one', async () => {
    const user = await signedInUser();
    assert.equal(
      (await register(user.token, { platform: 'symbian', push_token: PUSH_TOKEN })).statusCode, 422,
    );
    assert.equal(
      (await register(user.token, { platform: 'android', push_token: 'short' })).statusCode, 422,
    );
  });

  it('never writes the push token into the audit trail', async () => {
    const user = await signedInUser();
    await register(user.token, { platform: 'android', push_token: PUSH_TOKEN });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT action, after_state FROM audit_events WHERE action = 'device.registered'`,
      );
      assert.equal(rows.length, 1);
      assert.ok(!JSON.stringify(rows[0].after_state).includes(PUSH_TOKEN),
        'the token is a capability and never appears in a log');
    } finally { await pool.end(); }
  });

  it('one college never sees another college devices', async () => {
    const a = await signedInUser('alpha-dev', 'a@alpha.edu');
    const b = await signedInUser('beta-dev', 'b@beta.edu');
    await register(a.token, { platform: 'android', push_token: `${PUSH_TOKEN}-a` });
    await register(b.token, { platform: 'android', push_token: `${PUSH_TOKEN}-b` });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM devices WHERE tenant_id = $1`, [a.tenantId],
      );
      assert.equal(rows[0].n, 1, 'each registration lands in its own tenant');
    } finally { await pool.end(); }
  });
});

/**
 * ADM-1: changing one's own password. What matters: the current password is
 * required, the new one meets the policy, the change ends every session of
 * the account, the old password stops working and the new one works, it is
 * audited, and only a signed-in college account can do it.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform,
  MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const CODE = 'test-college';
const EMAIL = 'priya@testcollege.edu';

const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

const login = (password: string) =>
  call('POST', '/v1/auth/login', undefined, { institution_code: CODE, identifier: EMAIL, password });

async function signedInAdmin() {
  const owner = await seedPlatformAccount();
  const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
  const prov = await provisionCollege(harness.app, platform);
  await call('POST', '/v1/auth/accept-invite', undefined, {
    institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99',
  });
  const res = await login('admin-strong-99');
  assert.equal(res.statusCode, 200);
  return { platform, access: res.json().data.access_token as string, refresh: res.json().data.refresh_token as string };
}

describe('changing your own password', () => {
  it('refuses a wrong current password, a weak new one, and the same one, naming the field', async () => {
    const { access } = await signedInAdmin();
    const wrong = await call('POST', '/v1/auth/password', access, { current_password: 'not-it-12345', new_password: 'fresh-pass-77' });
    assert.notEqual(wrong.statusCode, 200);
    assert.ok(wrong.json().error.field_errors.current_password);

    const weak = await call('POST', '/v1/auth/password', access, { current_password: 'admin-strong-99', new_password: 'short' });
    assert.ok(weak.json().error.field_errors.new_password);

    const same = await call('POST', '/v1/auth/password', access, { current_password: 'admin-strong-99', new_password: 'admin-strong-99' });
    assert.ok(same.json().error.field_errors.new_password);
    assert.equal((await login('admin-strong-99')).statusCode, 200, 'nothing changed');
  });

  it('changes it, ends every session, and only the new password works; audited', async () => {
    const { access, refresh } = await signedInAdmin();
    const changed = await call('POST', '/v1/auth/password', access, {
      current_password: 'admin-strong-99', new_password: 'fresh-pass-77',
    });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json().data.signed_out, true);

    assert.notEqual((await call('POST', '/v1/auth/refresh', undefined, { refresh_token: refresh })).statusCode, 200,
      'the session this device had can no longer be renewed');
    assert.notEqual((await login('admin-strong-99')).statusCode, 200, 'the old password stops working');
    assert.equal((await login('fresh-pass-77')).statusCode, 200);

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(`SELECT actor_type FROM audit_events WHERE action = 'account.password_changed'`);
      assert.deepEqual(rows.map((r) => r.actor_type), ['person']);
    } finally {
      await pool.end();
    }
  });

  it('needs a signed-in college account', async () => {
    const { platform } = await signedInAdmin();
    const body = { current_password: 'x', new_password: 'fresh-pass-77' };
    assert.equal((await call('POST', '/v1/auth/password', undefined, body)).statusCode, 401);
    assert.equal((await call('POST', '/v1/auth/password', platform, body)).statusCode, 401);
  });
});

/**
 * AD-80: a forgotten password, recovered without email. What matters: only an
 * account manager issues a code, never for themselves, and an administrator's
 * only by another administrator or the platform; the old password works until
 * the code is redeemed; redeeming sets the new password, lifts a lockout and
 * ends every session; a code works once; shut accounts stay shut.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, MIGRATOR_URL, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform,
  type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

async function auditActions(sql: string) {
  const pool = createPool(MIGRATOR_URL);
  try { return (await pool.query(sql)).rows; } finally { await pool.end(); }
}

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const CODE = 'reset-college';

const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

const login = (identifier: string, password: string) =>
  call('POST', '/v1/auth/login', undefined, { institution_code: CODE, identifier, password });

const redeem = (token: string, password: string) =>
  call('POST', '/v1/auth/accept-invite', undefined, { institution_code: CODE, token, password });

async function college() {
  const owner = await seedPlatformAccount();
  const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
  const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'admin@reset.edu' });
  const institutionId = prov.body.data.institution.id as string;
  await redeem(prov.body.data.invitation.token, 'admin-strong-99');
  const admin = (await login('admin@reset.edu', 'admin-strong-99')).json().data.access_token as string;
  const invited = await call('POST', '/v1/people', admin, {
    full_name: 'Ravi Kumar', email: 'ravi@reset.edu', person_type: 'staff',
  });
  const raviId = invited.json().data.person_id as string;
  await redeem(invited.json().data.invitation.token, 'ravi-strong-99');
  return { platform, institutionId, admin, raviId };
}

describe('password reset codes', () => {
  it('an administrator resets a teacher: old password works until redeemed, then sessions end', async () => {
    const { admin, raviId } = await college();
    const session = await login('ravi@reset.edu', 'ravi-strong-99');
    const refresh = session.cookies.find((k) => k.name === 'refresh_token')?.value;

    const issued = await call('POST', `/v1/people/${raviId}/password-reset`, admin);
    assert.equal(issued.statusCode, 201);
    assert.equal(issued.json().data.kind, 'reset');
    const token = issued.json().data.token as string;

    assert.equal((await login('ravi@reset.edu', 'ravi-strong-99')).statusCode, 200, 'issuing locks nobody out');

    const done = await redeem(token, 'ravi-new-pass-7');
    assert.equal(done.statusCode, 200);
    assert.equal((await login('ravi@reset.edu', 'ravi-strong-99')).statusCode, 401);
    assert.equal((await login('ravi@reset.edu', 'ravi-new-pass-7')).statusCode, 200);
    assert.equal((await redeem(token, 'ravi-other-pass-8')).statusCode, 401, 'a code works once');

    if (refresh) {
      const renewed = await harness.app.inject({ method: 'POST', url: '/v1/auth/refresh', cookies: { refresh_token: refresh } });
      assert.notEqual(renewed.statusCode, 200, 'the session from before the reset is over');
    }

    const audit = await auditActions(
      `SELECT action FROM audit_events WHERE action IN ('account.password_reset_issued', 'account.password_reset') ORDER BY at`,
    );
    assert.deepEqual(audit.map((r) => r.action), ['account.password_reset_issued', 'account.password_reset']);
  });

  it('a newer code replaces the older one', async () => {
    const { admin, raviId } = await college();
    const first = (await call('POST', `/v1/people/${raviId}/password-reset`, admin)).json().data.token as string;
    const second = (await call('POST', `/v1/people/${raviId}/password-reset`, admin)).json().data.token as string;
    assert.equal((await redeem(first, 'ravi-new-pass-7')).statusCode, 401);
    assert.equal((await redeem(second, 'ravi-new-pass-7')).statusCode, 200);
  });

  it('nobody resets their own password this way, and a teacher cannot reset anybody', async () => {
    const { admin, raviId } = await college();
    const people = (await call('GET', '/v1/people?q=admin%40reset.edu', admin)).json().data as { person_id: string; email: string }[];
    const mine = people.find((p) => p.email === 'admin@reset.edu')!;
    const self = await call('POST', `/v1/people/${mine.person_id}/password-reset`, admin);
    assert.equal(self.statusCode, 403);

    const ravi = (await login('ravi@reset.edu', 'ravi-strong-99')).json().data.access_token as string;
    assert.equal((await call('POST', `/v1/people/${raviId}/password-reset`, ravi)).statusCode, 403);
    assert.equal((await call('POST', `/v1/people/${raviId}/password-reset`)).statusCode, 401);
  });

  it('a person who never accepted gets a fresh invitation instead', async () => {
    const { admin } = await college();
    const pending = await call('POST', '/v1/people', admin, { full_name: 'Asha Rao', email: 'asha@reset.edu', person_type: 'staff' });
    const issued = await call('POST', `/v1/people/${pending.json().data.person_id}/password-reset`, admin);
    assert.equal(issued.statusCode, 201);
    assert.equal(issued.json().data.kind, 'invitation');
    assert.equal((await redeem(pending.json().data.invitation.token, 'asha-strong-99')).statusCode, 401, 'the old invitation stopped');
    assert.equal((await redeem(issued.json().data.token, 'asha-strong-99')).statusCode, 200);
  });

  it('the Super Admin resets an administrator by email, and nobody else', async () => {
    const { platform, institutionId } = await college();
    const url = `/v1/institutions/${institutionId}/administrator-reset`;

    const notAdmin = await call('POST', url, platform, { email: 'ravi@reset.edu' });
    assert.equal(notAdmin.statusCode, 404);
    const unknown = await call('POST', url, platform, { email: 'nobody@reset.edu' });
    assert.equal(unknown.statusCode, 404);
    assert.equal(unknown.json().error.message, notAdmin.json().error.message, 'the same answer for both');

    const issued = await call('POST', url, platform, { email: 'ADMIN@reset.edu' });
    assert.equal(issued.statusCode, 201);
    assert.equal((await redeem(issued.json().data.token, 'admin-new-pass-7')).statusCode, 200);
    assert.equal((await login('admin@reset.edu', 'admin-new-pass-7')).statusCode, 200);

    const audit = await auditActions(
      `SELECT actor_type FROM audit_events WHERE action = 'account.password_reset_issued'`,
    );
    assert.deepEqual(audit.map((r) => r.actor_type), ['platform']);
  });

  it('a college account cannot use the platform route', async () => {
    const { admin, institutionId } = await college();
    const res = await call('POST', `/v1/institutions/${institutionId}/administrator-reset`, admin, { email: 'admin@reset.edu' });
    assert.equal(res.statusCode, 404, 'the platform route does not exist for a college account');
  });
});

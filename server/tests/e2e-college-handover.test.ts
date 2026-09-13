/**
 * The whole college flow, end to end, as the owner runs it (AD-72, AD-74,
 * WEB-1/ACC-1, SA-1, AD-70): the super admin creates a college with themselves
 * as a temporary administrator, sets it up, invites the real administrator and
 * hands over; then suspends, reactivates and closes it. Every step goes
 * through the public API, exactly as the apps call it.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, resetData, seedPlatformAccount, setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const CODE = 'handover-college';
const TEMP = 'owner@platform.test';
const REAL = 'principal@handover.edu';

const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

const collegeLogin = (email: string, password: string) =>
  call('POST', '/v1/auth/login', undefined, { institution_code: CODE, identifier: email, password });

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = createPool(MIGRATOR_URL);
  try {
    return (await pool.query(text, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

describe('a college from creation to closing', () => {
  it('is created, set up by a temporary admin, handed over, suspended, reactivated and closed', async () => {
    // 1. The super admin creates the college, naming themselves as its temporary administrator.
    const owner = await seedPlatformAccount();
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const created = await call('POST', '/v1/institutions', platform, {
      code: CODE, name: 'Handover College', admin: { full_name: 'Platform Owner', email: TEMP },
    });
    assert.equal(created.statusCode, 201);
    const collegeId = created.json().data.institution.id as string;
    const detail = async () => (await call('GET', `/v1/institutions/${collegeId}`, platform)).json().data;
    assert.equal((await detail()).administrator.invitation.state, 'pending');
    assert.equal(created.json().data.invitation.delivery, 'pending', 'nothing is emailed: the super admin hands it over');

    // 2. The app finds the college by its code before anybody signs in.
    assert.equal((await call('GET', `/v1/public/colleges/${CODE}`)).json().data.name, 'Handover College');

    // 3. The temporary administrator accepts with a password only they know, and signs in.
    const invitation = created.json().data.invitation.token as string;
    const accept = (token: string, password: string) =>
      call('POST', '/v1/auth/accept-invite', undefined, { institution_code: CODE, token, password });
    assert.equal((await accept(invitation, 'temp-strong-99')).statusCode, 200);
    assert.notEqual((await accept(invitation, 'other-strong-99')).statusCode, 200, 'an invitation works once');
    const tempLogin = await collegeLogin(TEMP, 'temp-strong-99');
    assert.equal(tempLogin.statusCode, 200);
    const temp = tempLogin.json().data.access_token as string;
    assert.equal((await detail()).administrator.invitation.state, 'accepted');

    // 4. They set the college up.
    const profile = (await call('GET', '/v1/college/profile', temp)).json().data;
    const branded = await call('POST', '/v1/college/profile', temp, {
      version: profile.version, name: 'Handover College',
      logo_url: 'https://cdn.test/logo.png', brand_color: '#1D4ED8',
    });
    assert.equal(branded.statusCode, 200);

    // 5. They invite the real administrator, who accepts and signs in.
    const invited = await call('POST', '/v1/people', temp, {
      full_name: 'Real Principal', email: REAL, person_type: 'staff',
      role: { role_key: 'college_admin', scope_type: 'institution' },
    });
    assert.equal(invited.statusCode, 201);
    assert.equal((await accept(invited.json().data.invitation.token, 'real-strong-99')).statusCode, 200);
    const realLogin = await collegeLogin(REAL, 'real-strong-99');
    assert.equal(realLogin.statusCode, 200);
    const real = realLogin.json().data.access_token as string;
    const me = (await call('GET', '/v1/auth/me', real)).json().data;
    assert.equal(me.login_identifier, REAL, 'the Profile shows the email they sign in with');
    assert.equal(me.full_name, 'Real Principal');

    // 6. The real administrator removes the temporary one, who loses access at once.
    const [tempRole] = await sql(
      `SELECT ra.id FROM role_assignments ra
         JOIN role_definitions rd ON rd.id = ra.role_id
         JOIN user_accounts ua ON ua.person_id = ra.person_id
        WHERE rd.key = 'college_admin' AND ra.status = 'active'
          AND ra.tenant_id = $1 AND ua.login_identifier = $2`,
      [collegeId, TEMP],
    );
    const revoked = await call('POST', `/v1/assignments/${tempRole.id}/revoke`, real, { reason: 'Handover to the principal' });
    assert.equal(revoked.statusCode, 200);
    assert.equal(
      (await call('POST', '/v1/people', temp, { full_name: 'Late Invite', email: 'late@handover.edu', person_type: 'staff' })).statusCode,
      403,
      'the temporary administrator can no longer act',
    );
    assert.equal((await call('GET', '/v1/auth/me', temp)).json().data.has_access, false);
    assert.equal(
      (await call('GET', '/v1/college/profile', real)).json().data.logo_url,
      'https://cdn.test/logo.png',
      'the setup stays with the college',
    );

    // 7. Suspend: people are refused at once, and the app no longer finds the college.
    const suspended = await call('POST', `/v1/institutions/${collegeId}/suspend`, platform, {
      version: (await detail()).version, reason: 'Payment pending',
    });
    assert.equal(suspended.statusCode, 200);
    assert.notEqual((await call('GET', '/v1/college/profile', real)).statusCode, 200, 'a live session stops at its next request');
    assert.notEqual((await collegeLogin(REAL, 'real-strong-99')).statusCode, 200);
    assert.equal((await call('GET', `/v1/public/colleges/${CODE}`)).statusCode, 404);

    // 8. Reactivate: everything as it was.
    const reactivated = await call('POST', `/v1/institutions/${collegeId}/reactivate`, platform, {
      version: (await detail()).version, reason: 'Payment received',
    });
    assert.equal(reactivated.statusCode, 200);
    const again = await collegeLogin(REAL, 'real-strong-99');
    assert.equal(again.statusCode, 200);
    assert.equal((await call('GET', '/v1/college/profile', again.json().data.access_token)).json().data.brand_color, '#1D4ED8');

    // 9. Close: final, confirmed by typing the code.
    const unconfirmed = await call('POST', `/v1/institutions/${collegeId}/close`, platform, {
      version: (await detail()).version, reason: 'Contract ended',
    });
    assert.notEqual(unconfirmed.statusCode, 200, 'closing needs the code typed');
    const closed = await call('POST', `/v1/institutions/${collegeId}/close`, platform, {
      version: (await detail()).version, reason: 'Contract ended', confirm_code: CODE,
    });
    assert.equal(closed.statusCode, 200);
    assert.equal((await detail()).status, 'closed');
    assert.deepEqual((await detail()).actions, [], 'nothing reopens a closed college');
    assert.notEqual((await collegeLogin(REAL, 'real-strong-99')).statusCode, 200);
    assert.equal((await call('GET', `/v1/public/colleges/${CODE}`)).statusCode, 404);
  });
});

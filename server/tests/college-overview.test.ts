/**
 * ADM-1: the College Admin dashboard's numbers. What matters: they count the
 * reader's own college only, they move when the college changes, and only a
 * person who may read the college's record gets them.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

async function adminOf(code: string, email: string, platform: string) {
  const prov = await provisionCollege(harness.app, platform, { code, adminEmail: email });
  await call('POST', '/v1/auth/accept-invite', undefined, {
    institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99',
  });
  const res = await call('POST', '/v1/auth/login', undefined, { institution_code: code, identifier: email, password: 'admin-strong-99' });
  assert.equal(res.statusCode, 200);
  return res.json().data.access_token as string;
}

describe('the college overview', () => {
  it("counts the admin's own college, and moves when someone is invited", async () => {
    const owner = await seedPlatformAccount();
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const admin = await adminOf('first-college', 'admin@first.edu', platform);
    // A second college with its own people must not show in the first one's numbers.
    const other = await adminOf('second-college', 'admin@second.edu', platform);
    await call('POST', '/v1/people', other, { full_name: 'Other Person', email: 'o@second.edu', person_type: 'staff' });

    const before = await call('GET', '/v1/college/overview', admin);
    assert.equal(before.statusCode, 200);
    assert.deepEqual(before.json().data, {
      staff: 1, students: 0, departments: 0, programs: 0, sections: 0, offerings: 0, rooms: 0, pending_invitations: 0,
    });

    const invited = await call('POST', '/v1/people', admin, { full_name: 'Ravi Kumar', email: 'ravi@first.edu', person_type: 'staff' });
    assert.equal(invited.statusCode, 201);
    const after = (await call('GET', '/v1/college/overview', admin)).json().data;
    assert.equal(after.staff, 2);
    assert.equal(after.pending_invitations, 1);

    // The invited person, once in, has no right to the college's numbers.
    await call('POST', '/v1/auth/accept-invite', undefined, {
      institution_code: 'first-college', token: invited.json().data.invitation.token, password: 'ravi-strong-99',
    });
    const ravi = (await call('POST', '/v1/auth/login', undefined, {
      institution_code: 'first-college', identifier: 'ravi@first.edu', password: 'ravi-strong-99',
    })).json().data.access_token as string;
    assert.equal((await call('GET', '/v1/college/overview', ravi)).statusCode, 403);
    assert.equal((await call('GET', '/v1/college/overview')).statusCode, 401);
  });
});

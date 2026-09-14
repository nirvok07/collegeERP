/**
 * OTP-6 (AD-82): changing where a person's sign-in code goes.
 *
 * What matters: a new email or mobile works at once and the old one stops; a
 * staff account's sign-in name moves with its email; an email or mobile another
 * person here uses is refused (sign-in by it would be ambiguous); an account
 * keeps somewhere to send a code; and only account managers may do it.
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

const CODE = '123456';

const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, token?: string) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = createPool(MIGRATOR_URL);
  try {
    return (await pool.query(text, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

const ask = (college: string, identifier: string) =>
  call('POST', '/v1/auth/otp/request', { institution_code: college, identifier });
const verify = (college: string, challenge: string) =>
  call('POST', '/v1/auth/otp/verify', { institution_code: college, challenge_token: challenge, code: CODE });

/** Signs in by code; the status of the verify step. */
async function signInStatus(college: string, identifier: string): Promise<number> {
  const challenge = (await ask(college, identifier)).json().data.challenge_token;
  return (await verify(college, challenge)).statusCode;
}

async function signIn(college: string, identifier: string): Promise<string> {
  const challenge = (await ask(college, identifier)).json().data.challenge_token;
  return (await verify(college, challenge)).json().data.access_token;
}

async function college(code = 'contact-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const owner = (await signInPlatform(harness.app, platform.email, platform.password)).body.data.access_token as string;
  await provisionCollege(harness.app, owner, { code, adminEmail: `admin@${code}.edu` });
  const admin = await signIn(code, `admin@${code}.edu`);
  const teacher = (await call('POST', '/v1/people', {
    full_name: 'Dr. Meera Iyer', email: `meera@${code}.edu`, phone: '98765 43210', person_type: 'staff',
  }, admin)).json().data.person_id as string;
  return { code, admin, teacher };
}

const change = (c: { admin: string }, personId: string, body: unknown, token = c.admin) =>
  call('PATCH', `/v1/people/${personId}/contact`, body, token);

describe('OTP-6: where a person\'s code goes', () => {
  it('a new email works at once, and the old one stops, sign-in name included', async () => {
    const c = await college();
    assert.equal(await signInStatus(c.code, `meera@${c.code}.edu`), 200);

    const res = await change(c, c.teacher, { email: `meera.iyer@${c.code}.edu` });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.email, `meera.iyer@${c.code}.edu`);

    assert.equal(await signInStatus(c.code, `meera@${c.code}.edu`), 401, 'the old email no longer signs in');
    assert.equal(await signInStatus(c.code, `meera.iyer@${c.code}.edu`), 200);
    const [account] = await sql(`SELECT login_identifier FROM user_accounts WHERE person_id = $1`, [c.teacher]);
    assert.equal(account.login_identifier, `meera.iyer@${c.code}.edu`);
  });

  it('a new mobile works at once, and the old one stops', async () => {
    const c = await college();
    assert.equal((await change(c, c.teacher, { phone: '+91 91234 56789' })).statusCode, 200);
    assert.equal(await signInStatus(c.code, '9876543210'), 401);
    assert.equal(await signInStatus(c.code, '91234-56789'), 200);
  });

  it('a code already sent to the old address stops working', async () => {
    const c = await college();
    const pending = (await ask(c.code, `meera@${c.code}.edu`)).json().data.challenge_token;
    await change(c, c.teacher, { phone: '91234 56789' });
    assert.equal((await verify(c.code, pending)).statusCode, 401);
  });

  it('refuses an email or mobile someone else here already uses', async () => {
    const c = await college();
    const email = await change(c, c.teacher, { email: `admin@${c.code}.edu` });
    assert.equal(email.statusCode, 409);
    assert.equal(email.json().error.field_errors.email, 'Already in use');

    const other = (await call('POST', '/v1/people', {
      full_name: 'Dr. Rohan Das', email: `rohan@${c.code}.edu`, person_type: 'staff',
    }, c.admin)).json().data.person_id as string;
    const phone = await change(c, other, { phone: '+91 98765 43210' });
    assert.equal(phone.statusCode, 409, 'the same number, written differently');
  });

  it('an account keeps somewhere to send a code, and staff keep their email', async () => {
    const c = await college();
    assert.equal((await change(c, c.teacher, { email: null })).statusCode, 422, 'staff sign in by their email');
    assert.equal((await change(c, c.teacher, { phone: null })).statusCode, 200, 'the mobile is optional');
    assert.equal((await change(c, c.teacher, { phone: '123' })).statusCode, 422);
  });

  it('the People list shows the mobile; the change is audited', async () => {
    const c = await college();
    await change(c, c.teacher, { phone: '91234 56789' });
    const people = (await call('GET', '/v1/people', undefined, c.admin)).json().data;
    assert.equal(people.find((p: { person_id: string }) => p.person_id === c.teacher).phone, '91234 56789');
    const [row] = await sql(`SELECT before_state, after_state FROM audit_events WHERE action = 'person.contact_changed'`);
    assert.equal(row.before_state.phone, '98765 43210');
    assert.equal(row.after_state.phone, '91234 56789');
  });

  it('only account managers may change it', async () => {
    const c = await college();
    const teacher = await signIn(c.code, `meera@${c.code}.edu`);
    assert.equal((await change(c, c.teacher, { phone: '91234 56789' }, teacher)).statusCode, 403);
  });
});

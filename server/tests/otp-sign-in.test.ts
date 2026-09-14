/**
 * OTP-1 (AD-82): sign-in by a one-time code to the person's email or mobile.
 *
 * What matters: the code opens the normal session; asking never reveals who is
 * registered; a code is single-use, short-lived and has five tries; asking is
 * rate-limited alike for known and unknown identifiers; an invited person
 * becomes active on their first code; the platform needs no authenticator; a
 * college account cannot come in by the platform's door, nor the reverse.
 * Every code is the fixed 123456 until go-live (the test config's default).
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform,
  MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';
import { classifyIdentifier } from '../src/modules/identity/application/otp-sign-in.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const CODE = '123456';

const call = (method: 'GET' | 'POST', url: string, payload?: unknown, token?: string) =>
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
const verify = (college: string, challenge: string, code = CODE) =>
  call('POST', '/v1/auth/otp/verify', { institution_code: college, challenge_token: challenge, code });

/** A college whose administrator was invited and has never signed in. */
async function college(code = 'otp-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const owner = (await signInPlatform(harness.app, platform.email, platform.password)).body.data.access_token as string;
  await provisionCollege(harness.app, owner, { code, adminEmail: `admin@${code}.edu` });
  return { code, adminEmail: `admin@${code}.edu` };
}

async function signIn(college: string, identifier: string): Promise<string> {
  const challenge = (await ask(college, identifier)).json().data.challenge_token;
  return (await verify(college, challenge)).json().data.access_token;
}

describe('what was typed', () => {
  it('tells an email, a mobile number and an enrolment number apart', () => {
    assert.deepEqual(classifyIdentifier(' Admin@College.EDU '), { kind: 'email', value: 'admin@college.edu' });
    assert.deepEqual(classifyIdentifier('+91 98765-43210'), { kind: 'phone', value: '9876543210' });
    assert.deepEqual(classifyIdentifier('9876543210'), { kind: 'phone', value: '9876543210' });
    assert.deepEqual(classifyIdentifier('2026CS10001'), { kind: 'enrolment', value: '2026cs10001' });
  });
});

describe('AD-82: a college signs in with a code', () => {
  it('an invited administrator signs in by email and becomes active; the session renews', async () => {
    const c = await college();
    const asked = await ask(c.code, c.adminEmail);
    assert.equal(asked.statusCode, 200);
    assert.equal(asked.json().data.destination, 'email');
    assert.ok(!('code' in asked.json().data), 'the code is never in the answer');

    const res = await verify(c.code, asked.json().data.challenge_token);
    assert.equal(res.statusCode, 200);
    const { access_token, refresh_token } = res.json().data;
    assert.equal((await call('GET', '/v1/auth/me', undefined, access_token)).statusCode, 200);

    const [account] = await sql(`SELECT status, activated_at FROM user_accounts WHERE login_identifier = $1`, [c.adminEmail]);
    assert.equal(account.status, 'active');
    assert.ok(account.activated_at);
    assert.equal((await call('POST', '/v1/auth/refresh', { refresh_token })).statusCode, 200);
  });

  it('asking answers alike for an identifier nobody has, and that code never works', async () => {
    const c = await college();
    const known = await ask(c.code, c.adminEmail);
    const unknown = await ask(c.code, `nobody@${c.code}.edu`);
    assert.equal(unknown.statusCode, known.statusCode);
    assert.deepEqual(Object.keys(unknown.json().data).sort(), Object.keys(known.json().data).sort());
    assert.equal(unknown.json().data.destination, known.json().data.destination);
    assert.equal((await verify(c.code, unknown.json().data.challenge_token)).statusCode, 401);
  });

  it('a wrong code is refused, and five wrong tries end the code', async () => {
    const c = await college();
    const challenge = (await ask(c.code, c.adminEmail)).json().data.challenge_token;
    const wrong = await verify(c.code, challenge, '000000');
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.json().error.message, 'That code is not correct.');
    for (let i = 0; i < 4; i++) await verify(c.code, challenge, '000000');
    const late = await verify(c.code, challenge);
    assert.equal(late.statusCode, 401, 'even the right code, after five wrong tries');
    assert.match(late.json().error.message, /expired/);
  });

  it('a code is used once, expires, and a newer one replaces it', async () => {
    const c = await college();
    const first = (await ask(c.code, c.adminEmail)).json().data.challenge_token;
    assert.equal((await verify(c.code, first)).statusCode, 200);
    assert.equal((await verify(c.code, first)).statusCode, 401, 'spent');

    const older = (await ask(c.code, c.adminEmail)).json().data.challenge_token;
    const newer = (await ask(c.code, c.adminEmail)).json().data.challenge_token;
    assert.equal((await verify(c.code, older)).statusCode, 401, 'replaced by the newer code');

    await sql(`UPDATE otp_challenges SET expires_at = now() - interval '1 second' WHERE consumed_at IS NULL`);
    const expired = await verify(c.code, newer);
    assert.equal(expired.statusCode, 401);
    assert.match(expired.json().error.message, /expired/);
  });

  it('at most five codes in fifteen minutes, known identifier or not', async () => {
    const c = await college();
    for (let i = 0; i < 5; i++) assert.equal((await ask(c.code, c.adminEmail)).statusCode, 200);
    assert.equal((await ask(c.code, c.adminEmail)).statusCode, 429);
    for (let i = 0; i < 5; i++) await ask(c.code, `ghost@${c.code}.edu`);
    assert.equal((await ask(c.code, `ghost@${c.code}.edu`)).statusCode, 429, 'the same limit for nobody');
  });

  it('a teacher signs in with their mobile number, however it is written', async () => {
    const c = await college();
    const admin = await signIn(c.code, c.adminEmail);
    const invited = await call('POST', '/v1/people', {
      full_name: 'Dr. Meera Iyer', email: `meera@${c.code}.edu`, phone: '+91 98765 43210', person_type: 'staff',
    }, admin);
    assert.equal(invited.statusCode, 201);

    const asked = await ask(c.code, '98765-43210');
    assert.equal(asked.json().data.destination, 'mobile');
    const res = await verify(c.code, asked.json().data.challenge_token);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.actor.actor_type, 'person');
  });

  it('a student signs in with their enrolment number; the code goes to what is on record', async () => {
    const c = await college();
    const admin = await signIn(c.code, c.adminEmail);
    const campus = (await call('GET', '/v1/campuses', undefined, admin)).json().data[0].id;
    const department = (await call('POST', '/v1/departments', { campus_id: campus, name: 'Computer Science', code: 'cse' }, admin)).json().data.id;
    const program = (await call('POST', '/v1/programs', {
      department_id: department, name: 'B.Tech CSE', code: 'btech-cse', duration_years: 4, term_type: 'semester',
    }, admin)).json().data.id;
    const student = (await call('POST', '/v1/students', {
      full_name: 'Aarav Sharma', email: `aarav@${c.code}.edu`, enrolment_number: '2026CS10001',
      program_id: program, admitted_on: '2026-07-20',
    }, admin)).json().data.id;
    assert.equal((await call('POST', `/v1/students/${student}/access`, undefined, admin)).statusCode, 201);

    const asked = await ask(c.code, '2026CS10001');
    assert.equal(asked.json().data.destination, 'record', 'the app says "your mobile or email on record"');
    assert.equal((await verify(c.code, asked.json().data.challenge_token)).statusCode, 200);
  });

  it('OTP-4: a student admitted with only a mobile signs in with it', async () => {
    const c = await college();
    const admin = await signIn(c.code, c.adminEmail);
    const campus = (await call('GET', '/v1/campuses', undefined, admin)).json().data[0].id;
    const department = (await call('POST', '/v1/departments', { campus_id: campus, name: 'Physics', code: 'phy' }, admin)).json().data.id;
    const program = (await call('POST', '/v1/programs', {
      department_id: department, name: 'B.Sc Physics', code: 'bsc-phy', duration_years: 3, term_type: 'semester',
    }, admin)).json().data.id;
    const student = (await call('POST', '/v1/students', {
      full_name: 'Diya Patel', phone: '+91 91234 56789', enrolment_number: '2026PH10002',
      program_id: program, admitted_on: '2026-07-20',
    }, admin)).json().data.id;
    assert.equal((await call('POST', `/v1/students/${student}/access`, undefined, admin)).statusCode, 201);

    const byMobile = await ask(c.code, '9123456789');
    assert.equal(byMobile.json().data.destination, 'mobile');
    assert.equal((await verify(c.code, byMobile.json().data.challenge_token)).statusCode, 200);
    const byNumber = await ask(c.code, '2026PH10002');
    assert.equal((await verify(c.code, byNumber.json().data.challenge_token)).statusCode, 200, 'the code goes to the mobile on record');
  });

  it('a college account cannot come in by the platform door, nor a platform one by the college door', async () => {
    const c = await college();
    const platformDoor = await call('POST', '/v1/auth/platform/otp/request', { email: c.adminEmail });
    assert.equal(platformDoor.statusCode, 200, 'the same answer');
    assert.equal((await call('POST', '/v1/auth/platform/otp/verify', {
      challenge_token: platformDoor.json().data.challenge_token, code: CODE,
    })).statusCode, 401);

    const collegeDoor = await ask(c.code, `owner+${c.code}@nirvok.com`);
    assert.equal((await verify(c.code, collegeDoor.json().data.challenge_token)).statusCode, 401);
  });
});

describe('AD-82: the platform signs in with a code', () => {
  it('an Owner signs in by email: no password, no authenticator, and the session works and renews', async () => {
    const owner = await seedPlatformAccount('owner@nirvok.com', 'unused-password-1', 'owner', { enrolled: false });
    const asked = await call('POST', '/v1/auth/platform/otp/request', { email: owner.email });
    assert.equal(asked.statusCode, 200);
    const res = await call('POST', '/v1/auth/platform/otp/verify', {
      challenge_token: asked.json().data.challenge_token, code: CODE,
    });
    assert.equal(res.statusCode, 200);
    const { access_token, refresh_token } = res.json().data;
    assert.equal((await call('GET', '/v1/institutions', undefined, access_token)).statusCode, 200);
    assert.equal((await call('GET', '/v1/auth/me', undefined, access_token)).json().data.actor_type, 'platform');
    assert.equal((await call('POST', '/v1/auth/refresh', { refresh_token })).statusCode, 200);
  });
});

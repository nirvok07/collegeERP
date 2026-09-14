/**
 * SA-3b: the platform's second factor (AD-62) with sealed secrets (AD-63).
 *
 * What matters: a password alone never yields a platform session; only a
 * fresh, correct code does, through a short single-use challenge; wrong codes
 * lock the account; nothing issued before enrolment keeps working; resets and
 * break-glass force re-enrolment and are audited; no secret ever leaves.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import { generateSync } from 'otplib';
import {
  buildTestApp, platformTotpSecrets, resetData, seedPlatformAccount, setupDatabase, signInPlatform,
  testConfig, totpCodeFor, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';
import { JwtTokenIssuer } from '../src/infrastructure/crypto/adapters.ts';
import { OtplibTotp } from '../src/infrastructure/crypto/totp.ts';
import { buildContainer } from '../src/container.ts';
import { breakGlassResetPlatformMfa, parseBreakGlassArgs } from '../src/modules/identity/application/platform-mfa.ts';

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

const PASSWORD = 'platform-pass-123';
const login = (email: string, password = PASSWORD) => call('POST', '/v1/auth/platform/login', undefined, { email, password });
const code = (secret: string, offsetSeconds = 0) =>
  generateSync({ secret, algorithm: 'sha1', digits: 6, period: 30, epoch: Math.floor(Date.now() / 1000) + offsetSeconds });

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = createPool(MIGRATOR_URL);
  try {
    return (await pool.query(text, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

describe('a password alone', () => {
  it('never opens a platform session: it yields a short challenge that is not an access token', async () => {
    await seedPlatformAccount();
    const res = await login('owner@nirvok.com');
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.step, 'second_factor');
    assert.ok(!('access_token' in data) && !('refresh_token' in data));
    assert.equal(res.cookies.length, 0, 'no refresh cookie before the second factor');
    assert.equal((await call('GET', '/v1/institutions', data.challenge_token)).statusCode, 401);
    assert.ok(Date.parse(data.expires_at) - Date.now() <= 300_000);
  });

  it('asks an account without an authenticator to enrol, and still issues no session', async () => {
    await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner', { enrolled: false });
    const data = (await login('owner@nirvok.com')).json().data;
    assert.equal(data.step, 'enrolment');
    assert.equal((await call('GET', '/v1/institutions', data.challenge_token)).statusCode, 401);
  });
});

describe('the second factor', () => {
  it('a correct code opens the normal session, with its refresh token', async () => {
    await seedPlatformAccount();
    const res = await signInPlatform(harness.app, 'owner@nirvok.com', PASSWORD);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.access_token && res.body.data.refresh_token);
    assert.equal((await call('GET', '/v1/institutions', res.body.data.access_token)).statusCode, 200);
  });

  it('refuses a wrong code, a spent challenge, an expired challenge and a replayed code', async () => {
    await seedPlatformAccount();
    const secret = platformTotpSecrets.get('owner@nirvok.com')!;

    const first = (await login('owner@nirvok.com')).json().data.challenge_token;
    const wrong = await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: first, code: code(secret, 3600) });
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.json().error.message, 'That code is not correct.');

    const good = code(secret);
    assert.equal((await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: first, code: good })).statusCode, 200);
    assert.equal((await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: first, code: good })).statusCode, 401, 'spent');

    const again = (await login('owner@nirvok.com')).json().data.challenge_token;
    assert.equal((await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: again, code: good })).statusCode, 401, 'replayed code');

    const third = (await login('owner@nirvok.com')).json().data.challenge_token;
    await sql(`UPDATE platform_auth_challenges SET expires_at = now() - interval '1 second' WHERE consumed_at IS NULL`);
    await sql(`UPDATE platform_accounts SET totp_last_step = NULL`);
    const expired = await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: third, code: code(secret) });
    assert.equal(expired.statusCode, 401);
    assert.match(expired.json().error.message, /expired/);
  });

  it('wrong codes count toward the lockout, and a correct password does not reset the count', async () => {
    await seedPlatformAccount();
    const secret = platformTotpSecrets.get('owner@nirvok.com')!;
    const bad = code(secret, 3600);
    const c1 = (await login('owner@nirvok.com')).json().data.challenge_token;
    for (let i = 0; i < 4; i++) {
      await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: c1, code: bad });
    }
    const c2 = (await login('owner@nirvok.com')).json().data.challenge_token;
    await call('POST', '/v1/auth/platform/second-factor', undefined, { challenge_token: c2, code: bad });
    const locked = await login('owner@nirvok.com');
    assert.equal(locked.statusCode, 423, 'five wrong codes lock the account');
    assert.equal(locked.json().error.code, 'ACCOUNT_LOCKED');
  });

  it('accepts a code from the neighbouring step and refuses one further away', () => {
    const totp = new OtplibTotp();
    const secret = totp.newSecret();
    const now = new Date();
    const at = (s: number) => new Date(now.getTime() + s * 1000);
    assert.equal(totp.verify(secret, code(secret, -30), now).valid, true);
    assert.equal(totp.verify(secret, code(secret, 30), now).valid, true);
    assert.equal(totp.verify(secret, code(secret), at(95)).valid, false);
    assert.equal(totp.verify(secret, 'abcdef', now).valid, false);
  });
});

describe('AD-82: a platform session rests on the account, not on an authenticator', () => {
  it('an active account without an authenticator keeps its session', async () => {
    const account = await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner', { enrolled: false });
    const token = new JwtTokenIssuer(testConfig().JWT_SECRET, 900).issueAccessToken({
      sub: account.id, actorType: 'platform', tenantId: null, accountId: null,
    }).token;
    assert.equal((await call('GET', '/v1/institutions', token)).statusCode, 200);
    assert.equal((await call('GET', '/v1/auth/me', token)).statusCode, 200);
  });

  it('an Owner reset clears the authenticator for the password door, needs a reason, and is Owner-only', async () => {
    await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner');
    const target = await seedPlatformAccount('owner2@nirvok.com', PASSWORD, 'owner');
    await seedPlatformAccount('support@nirvok.com', PASSWORD, 'support');
    const owner = (await signInPlatform(harness.app, 'owner@nirvok.com', PASSWORD)).body.data;
    const other = (await signInPlatform(harness.app, 'owner2@nirvok.com', PASSWORD)).body.data;
    const support = (await signInPlatform(harness.app, 'support@nirvok.com', PASSWORD)).body.data;

    assert.equal((await call('POST', `/v1/platform/accounts/${target.id}/mfa/reset`, support.access_token, { reason: 'Lost phone' })).statusCode, 403);
    assert.equal((await call('POST', `/v1/platform/accounts/${target.id}/mfa/reset`, owner.access_token, { reason: '' })).statusCode, 422);

    const res = await call('POST', `/v1/platform/accounts/${target.id}/mfa/reset`, owner.access_token, { reason: 'Lost phone' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.mfa, 'enrolment_required');

    // AD-82: sessions no longer depend on the authenticator; the password door
    // (the web console until OTP-5) asks for a new one.
    assert.equal((await call('GET', '/v1/institutions', other.access_token)).statusCode, 200);
    assert.equal((await login('owner2@nirvok.com')).json().data.step, 'enrolment');
    const [row] = await sql(`SELECT * FROM audit_events WHERE action = 'platform_account.mfa_reset'`);
    assert.equal(row.reason, 'Lost phone');
  });
});

describe('enrolment', () => {
  it('an existing Owner enrols: the secret is sealed at rest and shown only during setup', async () => {
    await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner', { enrolled: false });
    const challenge = (await login('owner@nirvok.com')).json().data.challenge_token;
    const begin = (await call('POST', '/v1/auth/platform/enrolment', undefined, { challenge_token: challenge })).json().data;
    assert.match(begin.otpauth_uri, /^otpauth:\/\/totp\//);
    const key = begin.manual_key as string;

    const [pending] = await sql(`SELECT totp_pending_sealed, totp_secret_sealed FROM platform_accounts`);
    assert.ok(pending.totp_pending_sealed.startsWith('s1.'));
    assert.ok(!pending.totp_pending_sealed.includes(key));
    assert.equal(pending.totp_secret_sealed, null, 'not active before a correct code');

    assert.equal((await call('POST', '/v1/auth/platform/enrolment/confirm', undefined, { challenge_token: challenge, code: code(key, 3600) })).statusCode, 401);
    assert.equal((await call('POST', '/v1/auth/platform/enrolment/confirm', undefined, { challenge_token: challenge, code: code(key) })).statusCode, 200);

    const [done] = await sql(`SELECT totp_pending_sealed, totp_secret_sealed, totp_enrolled_at FROM platform_accounts`);
    assert.equal(done.totp_pending_sealed, null);
    assert.ok(done.totp_secret_sealed.startsWith('s1.') && !done.totp_secret_sealed.includes(key));
    assert.ok(done.totp_enrolled_at);

    platformTotpSecrets.set('owner@nirvok.com', key);
    assert.equal((await signInPlatform(harness.app, 'owner@nirvok.com', PASSWORD)).status, 200);
  });

  it('a new account: invitation, password, authenticator, then sign-in as Support', async () => {
    await seedPlatformAccount();
    const owner = (await signInPlatform(harness.app, 'owner@nirvok.com', PASSWORD)).body.data.access_token;
    const created = (await call('POST', '/v1/platform/accounts', owner, { email: 'asha@nirvok.com', full_name: 'Asha Rao', role: 'support' })).json().data;
    assert.ok(created.invitation.token);
    assert.equal(created.mfa, 'enrolment_required');

    const weak = await call('POST', '/v1/auth/platform/accept-invite', undefined, { token: created.invitation.token, password: 'short' });
    assert.equal(weak.statusCode, 422);
    const accepted = (await call('POST', '/v1/auth/platform/accept-invite', undefined, { token: created.invitation.token, password: 'asha-strong-99' })).json().data;
    assert.equal(accepted.step, 'enrolment');
    assert.equal((await call('POST', '/v1/auth/platform/accept-invite', undefined, { token: created.invitation.token, password: 'asha-strong-99' })).statusCode, 401, 'single use');

    const key = (await call('POST', '/v1/auth/platform/enrolment', undefined, { challenge_token: accepted.challenge_token })).json().data.manual_key;
    assert.equal((await call('POST', '/v1/auth/platform/enrolment/confirm', undefined, { challenge_token: accepted.challenge_token, code: code(key) })).statusCode, 200);

    platformTotpSecrets.set('asha@nirvok.com', key);
    const session = await signInPlatform(harness.app, 'asha@nirvok.com', 'asha-strong-99');
    assert.equal(session.status, 200);
    const me = (await call('GET', '/v1/auth/me', session.body.data.access_token)).json().data;
    assert.deepEqual(me.permissions, ['platform.colleges.read']);
  });

  it('a reissued invitation revokes the previous link', async () => {
    await seedPlatformAccount();
    const owner = (await signInPlatform(harness.app, 'owner@nirvok.com', PASSWORD)).body.data.access_token;
    const created = (await call('POST', '/v1/platform/accounts', owner, { email: 'ravi@nirvok.com', full_name: 'Ravi Iyer', role: 'support' })).json().data;
    const again = (await call('POST', `/v1/platform/accounts/${created.id}/invitation`, owner)).json().data;
    assert.notEqual(again.invitation.token, created.invitation.token);
    assert.equal((await call('POST', '/v1/auth/platform/accept-invite', undefined, { token: created.invitation.token, password: 'ravi-strong-99' })).statusCode, 401);
    assert.equal((await call('POST', '/v1/auth/platform/accept-invite', undefined, { token: again.invitation.token, password: 'ravi-strong-99' })).statusCode, 200);
  });
});

describe('break-glass', () => {
  it('needs the exact confirmation phrase', () => {
    assert.ok('error' in parseBreakGlassArgs([]));
    assert.ok('error' in parseBreakGlassArgs(['--email', 'a@b.com', '--reason', 'r', '--operator', 'o', '--confirm', 'yes']));
    const ok = parseBreakGlassArgs(['--email', 'A@B.com', '--reason', 'phone lost', '--operator', 'Ops', '--confirm', 'RESET a@b.com']);
    assert.deepEqual(ok, { email: 'a@b.com', reason: 'phone lost', operator: 'Ops' });
  });

  it('clears only a sole Owner’s authenticator, audited as the system, forcing re-enrolment', async () => {
    await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner');
    await seedPlatformAccount('support@nirvok.com', PASSWORD, 'support');
    const container = buildContainer(testConfig());
    try {
      const short = await breakGlassResetPlatformMfa(container.platformMfa, { email: 'owner@nirvok.com', reason: 'short', operator: 'Ops' });
      assert.equal(short.ok, false);
      const notOwner = await breakGlassResetPlatformMfa(container.platformMfa, { email: 'support@nirvok.com', reason: 'Phone lost, identity confirmed', operator: 'Ops' });
      assert.equal(notOwner.ok, false);
      const ok = await breakGlassResetPlatformMfa(container.platformMfa, { email: 'owner@nirvok.com', reason: 'Phone lost, identity confirmed', operator: 'Ops' });
      assert.equal(ok.ok, true);
    } finally {
      await container.close();
    }
    const [row] = await sql(`SELECT * FROM audit_events WHERE action = 'platform_account.mfa_break_glass_reset'`);
    assert.equal(row.actor_type, 'system');
    assert.match(row.reason, /operator: Ops/);
    assert.equal((await login('owner@nirvok.com')).json().data.step, 'enrolment', 'no bypass: they must enrol again');

    const owner = await seedPlatformAccount('owner2@nirvok.com', PASSWORD, 'owner');
    const view = (await signInPlatform(harness.app, 'owner2@nirvok.com', PASSWORD)).body.data.access_token;
    const events = (await call('GET', '/v1/platform/audit?action=platform_account.mfa_break_glass_reset', view)).json().data.events;
    assert.equal(events.length, 1, 'Owners see the break-glass reset in the audit view');
    assert.ok(owner.id);
  });

  it('refuses when another Owner with an authenticator could reset it instead', async () => {
    await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner');
    await seedPlatformAccount('owner2@nirvok.com', PASSWORD, 'owner');
    const container = buildContainer(testConfig());
    try {
      const refused = await breakGlassResetPlatformMfa(container.platformMfa, { email: 'owner@nirvok.com', reason: 'Phone lost, identity confirmed', operator: 'Ops' });
      assert.equal(refused.ok, false);
    } finally {
      await container.close();
    }
  });
});

describe('no secret ever leaves', () => {
  it('neither account APIs nor the audit trail carry a TOTP secret or its sealed form', async () => {
    await seedPlatformAccount('owner@nirvok.com', PASSWORD, 'owner');
    const other = await seedPlatformAccount('owner2@nirvok.com', PASSWORD, 'owner', { enrolled: false });
    const owner = (await signInPlatform(harness.app, 'owner@nirvok.com', PASSWORD)).body.data.access_token;
    const challenge = (await login('owner2@nirvok.com')).json().data.challenge_token;
    const key = (await call('POST', '/v1/auth/platform/enrolment', undefined, { challenge_token: challenge })).json().data.manual_key;
    await call('POST', '/v1/auth/platform/enrolment/confirm', undefined, { challenge_token: challenge, code: code(key) });

    const list = (await call('GET', '/v1/platform/accounts', owner)).payload;
    const detail = (await call('GET', `/v1/platform/accounts/${other.id}`, owner)).payload;
    const audit = JSON.stringify(await sql(`SELECT * FROM audit_events`));
    const me = (await call('GET', '/v1/auth/me', owner)).payload;
    const sealed = (await sql(`SELECT totp_secret_sealed FROM platform_accounts WHERE totp_secret_sealed IS NOT NULL`)).map((r) => r.totp_secret_sealed as string);
    for (const text of [list, detail, audit, me]) {
      assert.ok(!/totp_|sealed/i.test(text), 'no sealed field names');
      for (const secret of [...platformTotpSecrets.values(), key]) assert.ok(!text.includes(secret));
      for (const s of sealed) assert.ok(!text.includes(s));
    }
    await totpCodeFor('owner@nirvok.com');
  });
});

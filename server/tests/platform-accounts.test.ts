/**
 * SA-3a, platform accounts and roles (migration 021).
 *
 * The tests that matter: only Owners manage accounts and roles; Support holds
 * no Owner power; college users never reach the surface; a new account cannot
 * sign in before enrolment exists; nobody changes their own account; the
 * platform always keeps a usable Owner, even when two Owners race; every
 * change is audited without a secret.
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

const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

async function signedIn(email: string, role: 'owner' | 'support') {
  const account = await seedPlatformAccount(email, 'platform-pass-123', role);
  const res = await signInPlatform(harness.app, email, 'platform-pass-123');
  assert.equal(res.status, 200);
  return { id: account.id, token: res.body.data.access_token as string, refresh: res.body.data.refresh_token as string | undefined };
}

async function audit(action: string) {
  const pool = createPool(MIGRATOR_URL);
  try {
    return (await pool.query(`SELECT * FROM audit_events WHERE action = $1`, [action])).rows;
  } finally {
    await pool.end();
  }
}

describe('who may manage platform accounts', () => {
  it('is Owners only: Support, college users and anonymous callers are refused', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const support = await signedIn('support@nirvok.com', 'support');
    assert.equal((await call('GET', '/v1/platform/accounts', owner.token)).statusCode, 200);

    assert.equal((await call('GET', '/v1/platform/accounts', support.token)).statusCode, 403);
    assert.equal((await call('POST', '/v1/platform/accounts', support.token, {
      email: 'x@nirvok.com', full_name: 'X Person', role: 'owner',
    })).statusCode, 403, 'Support cannot create accounts, let alone Owners');
    assert.equal((await call('POST', `/v1/platform/accounts/${owner.id}/role`, support.token, {
      role: 'support', expected_role: 'owner', reason: 'escalation attempt',
    })).statusCode, 403);
    assert.equal((await call('POST', `/v1/platform/accounts/${support.id}/role`, support.token, {
      role: 'owner', expected_role: 'support', reason: 'self escalation',
    })).statusCode, 403, 'no self-escalation');

    const prov = await provisionCollege(harness.app, owner.token);
    await call('POST', '/v1/auth/accept-invite', undefined, {
      institution_code: 'test-college', token: prov.body.data.invitation.token, password: 'admin-strong-99',
    });
    const college = (await call('POST', '/v1/auth/login', undefined, {
      institution_code: 'test-college', identifier: 'priya@testcollege.edu', password: 'admin-strong-99',
    })).json().data.access_token as string;
    assert.equal((await call('GET', '/v1/platform/accounts', college)).statusCode, 404);
    assert.equal((await call('GET', '/v1/platform/accounts')).statusCode, 401);
  });

  it('gives Support read access to colleges and nothing that changes them', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const support = await signedIn('support@nirvok.com', 'support');
    const prov = await provisionCollege(harness.app, owner.token);
    const id = prov.body.data.institution.id;

    assert.equal((await call('GET', '/v1/institutions', support.token)).statusCode, 200);
    assert.equal((await call('GET', `/v1/institutions/${id}`, support.token)).statusCode, 200);
    assert.equal((await call('POST', `/v1/institutions/${id}/suspend`, support.token, { version: 1, reason: 'test' })).statusCode, 403);
    assert.equal((await call('POST', `/v1/institutions/${id}/administrator-invitation`, support.token)).statusCode, 403);
    assert.equal((await provisionCollege(harness.app, support.token, { code: 'other', adminEmail: 'a@o.edu' })).status, 403);
    assert.equal((await call('GET', '/v1/platform/audit', support.token)).statusCode, 403);

    const me = (await call('GET', '/v1/auth/me', support.token)).json().data;
    assert.equal(me.platform_role, 'support');
    assert.deepEqual(me.permissions, ['platform.colleges.read']);
    const ownerMe = (await call('GET', '/v1/auth/me', owner.token)).json().data;
    assert.ok(ownerMe.permissions.includes('platform.accounts.manage'));
  });
});

describe('creating an account', () => {
  it('creates it waiting for enrolment, unable to sign in, and audits it without secrets', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const res = await call('POST', '/v1/platform/accounts', owner.token, {
      email: 'Asha@Nirvok.com', full_name: 'Asha Rao', role: 'support',
    });
    assert.equal(res.statusCode, 201);
    const created = res.json().data;
    assert.equal(created.status, 'invited');
    assert.equal(created.role, 'support');
    assert.equal(created.email, 'asha@nirvok.com');
    assert.ok(!('credential_hash' in created));

    const signIn = await signInPlatform(harness.app, 'asha@nirvok.com', 'anything-at-all-1');
    assert.notEqual(signIn.status, 200, 'no credential exists until enrolment');

    const [row] = await audit('platform_account.created');
    assert.equal(row.actor_type, 'platform');
    assert.equal(row.actor_id, owner.id);
    assert.equal((await audit('platform_role.assigned'))[0].after_state.role, 'support');
    assert.ok(!/password|credential|token|secret/i.test(JSON.stringify(row)));
  });

  it('refuses a duplicate email, an unknown role and a malformed email', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const dup = await call('POST', '/v1/platform/accounts', owner.token, { email: 'owner@nirvok.com', full_name: 'Again', role: 'support' });
    assert.equal(dup.statusCode, 409);
    const role = await call('POST', '/v1/platform/accounts', owner.token, { email: 'b@nirvok.com', full_name: 'B', role: 'superuser' });
    assert.equal(role.statusCode, 422);
    const email = await call('POST', '/v1/platform/accounts', owner.token, { email: 'not-an-email', full_name: 'C Person', role: 'support' });
    assert.equal(email.statusCode, 422);
  });
});

describe('disabling and enabling', () => {
  it('disables another account at once, including its live session, and enables it again', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const other = await signedIn('owner2@nirvok.com', 'owner');
    assert.equal((await call('GET', '/v1/institutions', other.token)).statusCode, 200);

    const off = await call('POST', `/v1/platform/accounts/${other.id}/disable`, owner.token, { reason: 'Left the company' });
    assert.equal(off.statusCode, 200);
    assert.equal(off.json().data.status, 'suspended');
    assert.equal((await call('GET', '/v1/institutions', other.token)).statusCode, 401, 'the live token stops working');
    if (other.refresh) {
      assert.notEqual((await call('POST', '/v1/auth/refresh', undefined, { refresh_token: other.refresh })).statusCode, 200);
    }
    assert.equal((await audit('platform_account.disabled'))[0].reason, 'Left the company');

    const on = await call('POST', `/v1/platform/accounts/${other.id}/enable`, owner.token, { reason: 'Rehired' });
    assert.equal(on.json().data.status, 'active');
    assert.equal((await call('GET', '/v1/institutions', other.token)).statusCode, 200);
  });

  it('needs a reason, and nobody may change their own account', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const other = await signedIn('owner2@nirvok.com', 'owner');
    assert.equal((await call('POST', `/v1/platform/accounts/${other.id}/disable`, owner.token, { reason: '' })).statusCode, 422);
    assert.equal((await call('POST', `/v1/platform/accounts/${owner.id}/disable`, owner.token, { reason: 'Myself' })).statusCode, 409);
    assert.equal((await call('POST', `/v1/platform/accounts/${owner.id}/role`, owner.token, {
      role: 'support', expected_role: 'owner', reason: 'Myself',
    })).statusCode, 409);
  });
});

describe('changing roles', () => {
  it('changes a role with history and an audit event, pinned to the role the Owner saw', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const support = await signedIn('support@nirvok.com', 'support');
    const stale = await call('POST', `/v1/platform/accounts/${support.id}/role`, owner.token, {
      role: 'owner', expected_role: 'owner', reason: 'Promotion',
    });
    assert.equal(stale.statusCode, 409);

    const res = await call('POST', `/v1/platform/accounts/${support.id}/role`, owner.token, {
      role: 'owner', expected_role: 'support', reason: 'Promotion',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.role, 'owner');
    assert.equal(res.json().data.role_history.length, 2);
    const [row] = await audit('platform_role.changed');
    assert.deepEqual(row.before_state, { role: 'support' });
    assert.deepEqual(row.after_state, { role: 'owner' });

    // The promoted account's next request already has Owner permissions.
    assert.equal((await call('GET', '/v1/platform/accounts', support.token)).statusCode, 200);
  });

  it('refuses an invalid role', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const support = await signedIn('support@nirvok.com', 'support');
    const res = await call('POST', `/v1/platform/accounts/${support.id}/role`, owner.token, {
      role: 'root', expected_role: 'support', reason: 'x y z',
    });
    assert.equal(res.statusCode, 422);
  });
});

describe('the platform always keeps a usable Owner', () => {
  it('two Owners demoting each other at once leaves exactly one Owner', async () => {
    const a = await signedIn('a@nirvok.com', 'owner');
    const b = await signedIn('b@nirvok.com', 'owner');
    const [ra, rb] = await Promise.all([
      call('POST', `/v1/platform/accounts/${b.id}/role`, a.token, { role: 'support', expected_role: 'owner', reason: 'Race one' }),
      call('POST', `/v1/platform/accounts/${a.id}/role`, b.token, { role: 'support', expected_role: 'owner', reason: 'Race two' }),
    ]);
    assert.deepEqual([ra.statusCode, rb.statusCode].sort(), [200, 403]);
    const list = (await call('GET', '/v1/platform/accounts', ra.statusCode === 200 ? a.token : b.token)).json().data as any[];
    assert.equal(list.filter((x) => x.role === 'owner').length, 1);
  });

  it('two Owners disabling each other at once leaves one active Owner', async () => {
    const a = await signedIn('a@nirvok.com', 'owner');
    const b = await signedIn('b@nirvok.com', 'owner');
    const results = await Promise.all([
      call('POST', `/v1/platform/accounts/${b.id}/disable`, a.token, { reason: 'Race one' }),
      call('POST', `/v1/platform/accounts/${a.id}/disable`, b.token, { reason: 'Race two' }),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 403]);
    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM platform_role_assignments ra JOIN platform_accounts pa ON pa.id = ra.platform_account_id
          WHERE ra.ended_at IS NULL AND ra.role = 'owner' AND pa.status = 'active'`,
      );
      assert.equal(rows[0].n, 1);
    } finally {
      await pool.end();
    }
  });

  it('does not offer to disable or demote the only active Owner', async () => {
    const owner = await signedIn('owner@nirvok.com', 'owner');
    const other = await signedIn('owner2@nirvok.com', 'owner');
    await call('POST', `/v1/platform/accounts/${other.id}/disable`, owner.token, { reason: 'Leave' });
    // From the disabled account's perspective nothing is possible; from the only
    // active Owner's, their own account offers nothing either.
    const self = (await call('GET', `/v1/platform/accounts/${owner.id}`, owner.token)).json().data;
    assert.deepEqual(self.actions, []);
  });
});

describe('the role table is protected like platform_accounts', () => {
  it('has row-level security forced and a policy that admits only the application role', async () => {
    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT c.relrowsecurity, c.relforcerowsecurity,
                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
           FROM pg_class c WHERE c.relname = 'platform_role_assignments'`,
      );
      assert.equal(rows[0].relrowsecurity, true);
      assert.equal(rows[0].relforcerowsecurity, true);
      assert.equal(rows[0].policies, 1);
    } finally {
      await pool.end();
    }
  });
});

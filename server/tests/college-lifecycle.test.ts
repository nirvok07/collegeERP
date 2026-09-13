/**
 * SA-1, the college lifecycle (AD-60, migration 019).
 *
 * The tests that matter: a suspended college's sessions stop on the next
 * request and at renewal, not only at the next sign-in; reactivation restores
 * them; closing is final; platform actors are never caught by the rule; every
 * transition is audited with its reason; and a reissued invitation revokes the
 * previous one while keeping single use and expiry.
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

type Res = LightMyRequestResponse;
const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<Res>;

async function setup() {
  const owner = await seedPlatformAccount();
  const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
  const prov = await provisionCollege(harness.app, platform);
  const college = prov.body.data.institution as { id: string; code: string };
  const firstToken = prov.body.data.invitation.token as string;
  return { platform, college, firstToken };
}

async function activateAdmin(code: string, token: string) {
  const accepted = await call('POST', '/v1/auth/accept-invite', undefined, {
    institution_code: code, token, password: 'admin-strong-99',
  });
  assert.equal(accepted.statusCode, 200);
  const login = await call('POST', '/v1/auth/login', undefined, {
    institution_code: code, identifier: 'priya@testcollege.edu', password: 'admin-strong-99',
  });
  assert.equal(login.statusCode, 200);
  const body = login.json().data;
  const refresh = (body.refresh_token as string | undefined)
    ?? login.cookies.find((c) => c.name.toLowerCase().includes('refresh'))?.value;
  return { access: body.access_token as string, refresh: refresh! };
}

const detail = async (platform: string, id: string) => (await call('GET', `/v1/institutions/${id}`, platform)).json().data;
const transition = (platform: string, id: string, action: string, body: Record<string, unknown>) =>
  call('POST', `/v1/institutions/${id}/${action}`, platform, body);

async function auditRows(tenantId: string, action: string) {
  const pool = createPool(MIGRATOR_URL);
  try {
    const { rows } = await pool.query(
      `SELECT actor_type, reason, before_state, after_state, tenant_id
         FROM audit_events WHERE tenant_id = $1 AND action = $2`,
      [tenantId, action],
    );
    return rows;
  } finally {
    await pool.end();
  }
}

describe('college detail', () => {
  it('shows the lifecycle, the actions the server allows, and the administrator\'s invitation', async () => {
    const { platform, college } = await setup();
    const d = await detail(platform, college.id);
    assert.equal(d.status, 'trial');
    assert.deepEqual(d.actions, ['suspend', 'close']);
    assert.equal(d.administrator.account_status, 'invited');
    assert.equal(d.administrator.invitation.state, 'pending');
    assert.equal(d.administrator.can_reissue, true);
    assert.equal(d.version, 1);
  });

  it('is a platform surface: a college user is told it does not exist, and nobody signed out gets in', async () => {
    const { platform, college, firstToken } = await setup();
    const admin = await activateAdmin(college.code, firstToken);
    assert.equal((await call('GET', `/v1/institutions/${college.id}`, admin.access)).statusCode, 404);
    assert.equal((await call('GET', `/v1/institutions/${college.id}`)).statusCode, 401);
    assert.equal((await transition(admin.access, college.id, 'suspend', { version: 1, reason: 'test' })).statusCode, 404);
    assert.equal((await call('GET', `/v1/institutions/${college.id}`, platform)).statusCode, 200);
  });
});

describe('suspending a college', () => {
  it('needs a reason and the current version', async () => {
    const { platform, college } = await setup();
    const noReason = await transition(platform, college.id, 'suspend', { version: 1, reason: ' ' });
    assert.equal(noReason.statusCode, 422);
    const stale = await transition(platform, college.id, 'suspend', { version: 9, reason: 'Unpaid invoice' });
    assert.equal(stale.statusCode, 409);
    assert.match(stale.json().error.message, /Somebody else changed this college/);
  });

  it('stops existing sessions on the next request and at renewal, not only at sign-in', async () => {
    const { platform, college, firstToken } = await setup();
    const admin = await activateAdmin(college.code, firstToken);
    assert.equal((await call('GET', '/v1/campuses', admin.access)).statusCode, 200);

    const res = await transition(platform, college.id, 'suspend', { version: 1, reason: 'Unpaid invoice' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.status, 'suspended');
    assert.equal(res.json().data.suspended_from, 'trial');

    const request = await call('GET', '/v1/campuses', admin.access);
    assert.equal(request.statusCode, 403);
    assert.equal(request.json().error.code, 'TENANT_SUSPENDED');

    const renewal = await call('POST', '/v1/auth/refresh', undefined, { refresh_token: admin.refresh });
    assert.equal(renewal.statusCode, 403);
    assert.equal(renewal.json().error.code, 'TENANT_SUSPENDED');

    const signIn = await call('POST', '/v1/auth/login', undefined, {
      institution_code: college.code, identifier: 'priya@testcollege.edu', password: 'admin-strong-99',
    });
    assert.notEqual(signIn.statusCode, 200);
  });

  it('never affects platform accounts', async () => {
    const { platform, college } = await setup();
    await transition(platform, college.id, 'suspend', { version: 1, reason: 'Unpaid invoice' });
    assert.equal((await call('GET', '/v1/institutions', platform)).statusCode, 200);
    assert.equal((await call('GET', `/v1/institutions/${college.id}`, platform)).statusCode, 200);
  });

  it('is audited with its reason, attributed to the platform', async () => {
    const { platform, college } = await setup();
    await transition(platform, college.id, 'suspend', { version: 1, reason: 'Unpaid invoice' });
    const [row] = await auditRows(college.id, 'institution.suspended');
    assert.equal(row.actor_type, 'platform');
    assert.equal(row.reason, 'Unpaid invoice');
    assert.deepEqual(row.before_state, { status: 'trial' });
    assert.deepEqual(row.after_state, { status: 'suspended' });
  });

  it('refuses to suspend twice', async () => {
    const { platform, college } = await setup();
    await transition(platform, college.id, 'suspend', { version: 1, reason: 'Unpaid invoice' });
    const again = await transition(platform, college.id, 'suspend', { version: 2, reason: 'Again' });
    assert.equal(again.statusCode, 409);
  });
});

describe('reactivating a college', () => {
  it('returns it to the status it was suspended from and restores its sessions', async () => {
    const { platform, college, firstToken } = await setup();
    const admin = await activateAdmin(college.code, firstToken);
    await transition(platform, college.id, 'suspend', { version: 1, reason: 'Unpaid invoice' });
    assert.equal((await call('GET', '/v1/campuses', admin.access)).statusCode, 403);

    const back = await transition(platform, college.id, 'reactivate', { version: 2, reason: 'Invoice paid' });
    assert.equal(back.statusCode, 200);
    assert.equal(back.json().data.status, 'trial');
    assert.equal(back.json().data.suspended_from, null);
    assert.equal((await call('GET', '/v1/campuses', admin.access)).statusCode, 200);
    assert.equal((await call('POST', '/v1/auth/refresh', undefined, { refresh_token: admin.refresh })).statusCode, 200);
    assert.equal((await auditRows(college.id, 'institution.reactivated'))[0].reason, 'Invoice paid');
  });

  it('refuses to reactivate a college that is not suspended', async () => {
    const { platform, college } = await setup();
    const res = await transition(platform, college.id, 'reactivate', { version: 1, reason: 'No reason' });
    assert.equal(res.statusCode, 409);
  });
});

describe('closing a college', () => {
  it('needs the college code typed back, then is final', async () => {
    const { platform, college, firstToken } = await setup();
    const admin = await activateAdmin(college.code, firstToken);

    const unconfirmed = await transition(platform, college.id, 'close', { version: 1, reason: 'Contract ended' });
    assert.equal(unconfirmed.statusCode, 422);
    const wrong = await transition(platform, college.id, 'close', { version: 1, reason: 'Contract ended', confirm_code: 'nope' });
    assert.equal(wrong.statusCode, 422);

    const closed = await transition(platform, college.id, 'close', {
      version: 1, reason: 'Contract ended', confirm_code: college.code,
    });
    assert.equal(closed.statusCode, 200);
    assert.deepEqual(closed.json().data.actions, []);

    const request = await call('GET', '/v1/campuses', admin.access);
    assert.equal(request.statusCode, 403);
    assert.equal(request.json().error.message, 'This college is closed.');

    for (const action of ['reactivate', 'suspend']) {
      assert.equal((await transition(platform, college.id, action, { version: 2, reason: 'Undo' })).statusCode, 409);
    }
    assert.equal((await auditRows(college.id, 'institution.closed')).length, 1);
  });

  it('is final in the database too, not only in the application', async () => {
    const { platform, college } = await setup();
    await transition(platform, college.id, 'close', { version: 1, reason: 'Contract ended', confirm_code: college.code });
    const pool = createPool(MIGRATOR_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE institutions SET status = 'active' WHERE id = $1`, [college.id]),
        /Closing cannot be undone/,
      );
    } finally {
      await pool.end();
    }
  });
});

describe('reissuing the administrator invitation', () => {
  it('revokes the previous link, issues a single-use one, and audits it without the token', async () => {
    const { platform, college, firstToken } = await setup();
    const res = await call('POST', `/v1/institutions/${college.id}/administrator-invitation`, platform);
    assert.equal(res.statusCode, 201);
    const next = res.json().data.invitation.token as string;
    assert.ok(next && next !== firstToken);
    assert.ok(Date.parse(res.json().data.invitation.expires_at) > Date.now(), 'it expires, in the future');

    const old = await call('POST', '/v1/auth/accept-invite', undefined, {
      institution_code: college.code, token: firstToken, password: 'admin-strong-99',
    });
    assert.equal(old.statusCode, 401, 'the previous link no longer works');

    await activateAdmin(college.code, next);
    const reused = await call('POST', '/v1/auth/accept-invite', undefined, {
      institution_code: college.code, token: next, password: 'another-strong-99',
    });
    assert.equal(reused.statusCode, 401, 'single use');

    const [row] = await auditRows(college.id, 'invitation.reissued');
    assert.equal(row.actor_type, 'platform');
    assert.equal(row.after_state.revoked_previous, 1);
    assert.ok(!JSON.stringify(row).includes(next), 'the token never reaches the audit trail');

    const d = await detail(platform, college.id);
    assert.equal(d.administrator.invitation.state, 'accepted');
    assert.equal(d.administrator.can_reissue, false);
  });

  it('is refused once the administrator has activated, and for a suspended college', async () => {
    const { platform, college, firstToken } = await setup();
    await activateAdmin(college.code, firstToken);
    const activated = await call('POST', `/v1/institutions/${college.id}/administrator-invitation`, platform);
    assert.equal(activated.statusCode, 409);

    const other = await setup2(platform);
    await transition(platform, other.id, 'suspend', { version: 1, reason: 'Unpaid invoice' });
    const suspended = await call('POST', `/v1/institutions/${other.id}/administrator-invitation`, platform);
    assert.equal(suspended.statusCode, 409);
  });
});

async function setup2(platform: string) {
  const prov = await provisionCollege(harness.app, platform, {
    code: 'second-college', name: 'Second College', adminEmail: 'admin@second.edu',
  });
  return prov.body.data.institution as { id: string };
}

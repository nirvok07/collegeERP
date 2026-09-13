/**
 * SA-4a: seats (AD-65, migration 023). These test the rule in the database,
 * not only in the service: every live college account is one seat; the
 * database refuses a new one at or over the limit on every path, including a
 * write that bypasses the application, and under a real race.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, resetData, seedPlatformAccount, setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
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

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = createPool(MIGRATOR_URL);
  try { return (await pool.query(text, params)).rows as T[]; } finally { await pool.end(); }
}

async function platform(role: 'owner' | 'support' = 'owner', email = `${role}@nirvok.com`) {
  await seedPlatformAccount(email, 'platform-pass-123', role);
  return (await signInPlatform(harness.app, email, 'platform-pass-123')).body.data.access_token as string;
}

/** A college with the given limit, its administrator signed in. */
async function college(owner: string, seatLimit: number, code = 'seat-college') {
  const prov = await call('POST', '/v1/institutions', owner, {
    code, name: 'Seat College', seat_limit: seatLimit,
    admin: { full_name: 'Priya Sharma', email: `admin@${code}.edu` },
  });
  assert.equal(prov.statusCode, 201);
  const d = prov.json().data;
  await call('POST', '/v1/auth/accept-invite', undefined, {
    institution_code: code, token: d.invitation.token, password: 'admin-strong-99',
  });
  const admin = (await call('POST', '/v1/auth/login', undefined, {
    institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99',
  })).json().data.access_token as string;
  return { id: d.institution.id as string, admin, code };
}

const invite = (admin: string, n: string) =>
  call('POST', '/v1/people', admin, { full_name: `Staff ${n}`, email: `staff${n}@seat.edu`, person_type: 'staff' });
const seats = async (owner: string, id: string) => (await call('GET', `/v1/institutions/${id}`, owner)).json().data.seats;

describe('what counts as a seat', () => {
  it('counts invited, active, locked and suspended accounts, once each, and nothing else', async () => {
    const owner = await platform();
    const c = await college(owner, 10);
    assert.deepEqual(await seats(owner, c.id), { used: 1, limit: 10, remaining: 9, state: 'UNDER_LIMIT' }, 'the active administrator');

    assert.equal((await invite(c.admin, '1')).statusCode, 201);
    assert.equal((await invite(c.admin, '2')).statusCode, 201);
    assert.equal((await seats(owner, c.id)).used, 3, 'invited accounts count');

    await sql(`UPDATE user_accounts SET status = 'locked' WHERE login_identifier = 'staff1@seat.edu'`);
    await sql(`UPDATE user_accounts SET status = 'suspended' WHERE login_identifier = 'staff2@seat.edu'`);
    assert.equal((await seats(owner, c.id)).used, 3, 'locked and suspended still hold their seat');

    await platform('support', 'support@nirvok.com');
    // A second role for the administrator, in another scope: still one person, one seat.
    const campus = (await call('GET', '/v1/campuses', c.admin)).json().data[0].id;
    const dept = (await call('POST', '/v1/departments', c.admin, { campus_id: campus, name: 'Computer Science', code: 'cse' })).json().data.id;
    const [role] = await sql(`SELECT id FROM role_definitions WHERE key = 'faculty' AND tenant_id IS NULL`);
    const [adminPerson] = await sql(`SELECT person_id FROM user_accounts WHERE login_identifier = 'admin@seat-college.edu'`);
    await sql(
      `INSERT INTO role_assignments (id, tenant_id, person_id, role_id, scope_type, scope_ref_id, status, source)
       VALUES ($1, $2, $3, $4, 'department', $5, 'active', 'manual')`,
      [randomUUID(), c.id, adminPerson.person_id, role.id, dept],
    );
    assert.equal((await seats(owner, c.id)).used, 3, 'platform accounts and extra role assignments add no seat');

    await sql(`UPDATE user_accounts SET status = 'deactivated' WHERE login_identifier = 'staff2@seat.edu'`);
    assert.equal((await seats(owner, c.id)).used, 2, 'a deactivated account frees its seat');
  });

  it('never lets one person hold two live accounts', async () => {
    const owner = await platform();
    const c = await college(owner, 10);
    const [a] = await sql(`SELECT person_id FROM user_accounts WHERE tenant_id = $1`, [c.id]);
    await assert.rejects(
      sql(`INSERT INTO user_accounts (id, tenant_id, person_id, login_identifier, status) VALUES ($1, $2, $3, 'second@seat.edu', 'invited')`,
        [randomUUID(), c.id, a.person_id]),
      /one_live_per_person/,
    );
  });
});

describe('the limit', () => {
  it('allows accounts up to the limit and refuses the next, rolling the whole invitation back', async () => {
    const owner = await platform();
    const c = await college(owner, 3);
    assert.equal((await invite(c.admin, '1')).statusCode, 201);
    assert.equal((await invite(c.admin, '2')).statusCode, 201);
    assert.equal((await seats(owner, c.id)).state, 'AT_LIMIT');

    const refused = await invite(c.admin, '3');
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().error.code, 'SEAT_LIMIT_REACHED');
    assert.match(refused.json().error.message, /all 3 of its seats/);
    assert.equal((await sql(`SELECT count(*)::int AS n FROM persons WHERE primary_email = 'staff3@seat.edu'`))[0].n, 0, 'nothing half-created');
  });

  it('accepting an invitation takes no second seat, even at the limit', async () => {
    const owner = await platform();
    const c = await college(owner, 2);
    const inv = (await invite(c.admin, '1')).json().data;
    assert.equal((await seats(owner, c.id)).state, 'AT_LIMIT');
    const accepted = await call('POST', '/v1/auth/accept-invite', undefined, {
      institution_code: c.code, token: inv.invitation.token, password: 'staff-strong-99',
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal((await seats(owner, c.id)).used, 2);
  });

  it('lowering below use disables nobody, marks the college over its limit, and refuses new accounts', async () => {
    const owner = await platform();
    const c = await college(owner, 5);
    await invite(c.admin, '1'); await invite(c.admin, '2');
    const detail = (await call('GET', `/v1/institutions/${c.id}`, owner)).json().data;
    const lowered = await call('POST', `/v1/institutions/${c.id}/plan`, owner, { version: detail.version, seat_limit: 2, reason: 'Downgrade agreed' });
    assert.equal(lowered.statusCode, 200);
    assert.deepEqual(lowered.json().data.seats, { used: 3, limit: 2, remaining: 0, state: 'OVER_LIMIT' });

    const statuses = await sql(`SELECT status FROM user_accounts WHERE tenant_id = $1 ORDER BY login_identifier`, [c.id]);
    assert.deepEqual(statuses.map((s) => s.status).sort(), ['active', 'invited', 'invited'], 'every account untouched');
    assert.equal((await call('GET', '/v1/campuses', c.admin)).statusCode, 200, 'the administrator keeps working');
    assert.equal((await invite(c.admin, '3')).statusCode, 409);

    const raised = await call('POST', `/v1/institutions/${c.id}/plan`, owner, { version: lowered.json().data.version, seat_limit: 4, reason: 'Upgrade' });
    assert.equal(raised.json().data.seats.state, 'UNDER_LIMIT');
    assert.equal((await invite(c.admin, '3')).statusCode, 201);
  });

  it('refuses a deactivated account becoming live again when there is no seat', async () => {
    const owner = await platform();
    const c = await college(owner, 2);
    await invite(c.admin, '1');
    await sql(`UPDATE user_accounts SET status = 'deactivated' WHERE login_identifier = 'staff1@seat.edu'`);
    await invite(c.admin, '2');
    await assert.rejects(
      sql(`UPDATE user_accounts SET status = 'active' WHERE login_identifier = 'staff1@seat.edu'`),
      (e: any) => e.code === 'ERS01',
    );
  });
});

describe('the first college administrator', () => {
  it('holds a seat from the start, inside the atomic provisioning', async () => {
    const owner = await platform();
    const c = await college(owner, 1);
    assert.deepEqual(await seats(owner, c.id), { used: 1, limit: 1, remaining: 0, state: 'AT_LIMIT' });
    assert.equal((await invite(c.admin, '1')).statusCode, 409);
  });
});

describe('the database enforces it on every path', () => {
  it('refuses a live account written directly, outside the application', async () => {
    const owner = await platform();
    const c = await college(owner, 1);
    const person = randomUUID();
    await sql(`INSERT INTO persons (id, tenant_id, full_name, person_type) VALUES ($1, $2, 'Direct Write', 'staff')`, [person, c.id]);
    await assert.rejects(
      sql(`INSERT INTO user_accounts (id, tenant_id, person_id, login_identifier, status) VALUES ($1, $2, $3, 'direct@seat.edu', 'invited')`,
        [randomUUID(), c.id, person]),
      (e: any) => e.code === 'ERS01' && /all 1 of its seats/.test(e.message),
    );
    await sql(`INSERT INTO user_accounts (id, tenant_id, person_id, login_identifier, status) VALUES ($1, $2, $3, 'direct@seat.edu', 'deactivated')`,
      [randomUUID(), c.id, person]);
  });

  it('lets exactly one of two simultaneous invitations take the last seat', async () => {
    const owner = await platform();
    const c = await college(owner, 2);
    const results = await Promise.all([invite(c.admin, 'a'), invite(c.admin, 'b'), invite(c.admin, 'c')]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409, 409]);
    assert.equal((await seats(owner, c.id)).used, 2);
  });

  it('keeps colleges apart: one at its limit does not block another', async () => {
    const owner = await platform();
    const a = await college(owner, 1, 'seat-a');
    const b = await college(owner, 5, 'seat-b');
    assert.equal((await invite(a.admin, 'a1')).statusCode, 409);
    assert.equal((await call('POST', '/v1/people', b.admin, { full_name: 'Staff B', email: 'staffb@seat-b.edu', person_type: 'staff' })).statusCode, 201);
  });
});

describe('changing plan and seats', () => {
  it('is Owner only, needs a reason and the current version, and is audited', async () => {
    const owner = await platform();
    const support = await platform('support', 'support@nirvok.com');
    const c = await college(owner, 5);
    const v = (await call('GET', `/v1/institutions/${c.id}`, owner)).json().data.version;
    const body = { version: v, plan: 'Premium', seat_limit: 50, reason: 'Contract signed' };

    assert.equal((await call('POST', `/v1/institutions/${c.id}/plan`, support, body)).statusCode, 403);
    assert.equal((await call('POST', `/v1/institutions/${c.id}/plan`, c.admin, body)).statusCode, 404);
    assert.equal((await call('POST', `/v1/institutions/${c.id}/plan`, undefined, body)).statusCode, 401);
    assert.equal((await call('POST', `/v1/institutions/${c.id}/plan`, owner, { ...body, reason: '' })).statusCode, 422);
    assert.equal((await call('POST', `/v1/institutions/${c.id}/plan`, owner, { ...body, seat_limit: 0 })).statusCode, 422);
    assert.equal((await call('POST', `/v1/institutions/${c.id}/plan`, owner, { version: v, reason: 'Nothing', plan: 'standard', seat_limit: 5 })).statusCode, 422);

    const ok = await call('POST', `/v1/institutions/${c.id}/plan`, owner, body);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().data.plan, 'Premium');
    assert.equal(ok.json().data.seats.limit, 50);

    const stale = await call('POST', `/v1/institutions/${c.id}/plan`, owner, { ...body, seat_limit: 60 });
    assert.equal(stale.statusCode, 409);
    assert.match(stale.json().error.message, /Somebody else changed this college/);

    const [row] = await sql(`SELECT * FROM audit_events WHERE action = 'institution.plan_changed'`);
    assert.equal(row.actor_type, 'platform');
    assert.equal(row.tenant_id, c.id);
    assert.equal(row.reason, 'Contract signed');
    assert.deepEqual(row.before_state, { plan: 'standard', seat_limit: 5 });
    assert.equal(row.after_state.plan, 'Premium');
    assert.equal(row.after_state.seat_limit, 50);
    // The event's content, not its column names (ip_hash is a column).
    assert.ok(!/password|token|secret/i.test(JSON.stringify({ b: row.before_state, a: row.after_state, r: row.reason })));
  });

  it('refuses changes to a closed college', async () => {
    const owner = await platform();
    const c = await college(owner, 5);
    const d = (await call('GET', `/v1/institutions/${c.id}`, owner)).json().data;
    await call('POST', `/v1/institutions/${c.id}/close`, owner, { version: d.version, reason: 'Contract ended', confirm_code: c.code });
    const res = await call('POST', `/v1/institutions/${c.id}/plan`, owner, { version: d.version + 1, seat_limit: 9, reason: 'Late' });
    assert.equal(res.statusCode, 409);
  });
});

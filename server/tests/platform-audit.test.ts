/**
 * SA-2, the platform audit view (AD-61, migration 020).
 *
 * What matters: only platform accounts can read it; it shows only events a
 * platform account caused, across every college and without one; pages are
 * stable while new events arrive; filters are validated; nothing secret leaves.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

const get = (url: string, token?: string) =>
  harness.app.inject({
    method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as Promise<LightMyRequestResponse>;
const post = (url: string, token: string, payload: unknown) =>
  harness.app.inject({
    method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload: payload as never,
  }) as Promise<LightMyRequestResponse>;

async function world() {
  const owner = await seedPlatformAccount();
  const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
  const a = (await provisionCollege(harness.app, platform)).body.data;
  const b = (await provisionCollege(harness.app, platform, {
    code: 'second-college', name: 'Second College', adminEmail: 'admin@second.edu',
  })).body.data;
  await post(`/v1/institutions/${a.institution.id}/suspend`, platform, { version: 1, reason: 'Unpaid invoice' });

  // The first college's administrator activates and signs in: their events are
  // the college's own and must never appear in the platform view.
  await harness.app.inject({ method: 'POST', url: '/v1/auth/accept-invite', payload: {
    institution_code: 'second-college', token: b.invitation.token, password: 'admin-strong-99',
  } });
  const college = (await harness.app.inject({ method: 'POST', url: '/v1/auth/login', payload: {
    institution_code: 'second-college', identifier: 'admin@second.edu', password: 'admin-strong-99',
  } })).json().data.access_token as string;
  return { platform, college, a: a.institution.id as string, b: b.institution.id as string };
}

async function insertPlatformEvents(n: number, at: string, extra: Record<string, unknown> = {}) {
  const pool = createPool(MIGRATOR_URL);
  try {
    const { rows } = await pool.query(`SELECT id FROM platform_accounts LIMIT 1`);
    for (let i = 0; i < n; i++) {
      await pool.query(
        `INSERT INTO audit_events (id, tenant_id, correlation_id, actor_type, actor_id, action,
                                   subject_type, subject_id, after_state, at)
         VALUES ($1, NULL, $2, 'platform', $3, 'test.bulk', 'platform_account', $3, $4, $5)`,
        [randomUUID(), randomUUID(), rows[0].id, JSON.stringify({ n: i, ...extra }), at],
      );
    }
  } finally {
    await pool.end();
  }
}

describe('who may read it', () => {
  it('is for platform accounts only', async () => {
    const { platform, college } = await world();
    assert.equal((await get('/v1/platform/audit', platform)).statusCode, 200);
    assert.equal((await get('/v1/platform/audit', college)).statusCode, 404, 'a college user is told it does not exist');
    assert.equal((await get('/v1/platform/audit')).statusCode, 401);
  });
});

describe('what it shows', () => {
  it('shows platform events across colleges and without one, and never a college user\'s own', async () => {
    const { platform } = await world();
    const events = (await get('/v1/platform/audit?limit=100', platform)).json().data.events as any[];
    const actions = new Set(events.map((e) => e.action));
    assert.ok(actions.has('institution.provisioned'));
    assert.ok(actions.has('institution.suspended'));
    assert.ok(actions.has('auth.signed_in'), 'platform sign-in has no college and is still shown');
    assert.ok(!actions.has('account.activated'), 'the administrator activating is the college\'s event');
    assert.ok(events.every((e) => e.actor && e.actor.email), 'every event names its platform actor');

    const suspended = events.find((e) => e.action === 'institution.suspended');
    assert.equal(suspended.reason, 'Unpaid invoice');
    assert.equal(suspended.college.code, 'test-college');
    assert.deepEqual(suspended.after, { status: 'suspended' });
    assert.equal(events.find((e) => e.action === 'auth.signed_in').college, null);
    assert.ok(!('ip_hash' in suspended));
  });

  it('never returns a secret, even one written into a payload by mistake', async () => {
    const { platform } = await world();
    await insertPlatformEvents(1, new Date().toISOString(), {
      token: 'plain-secret-value', nested: { refreshToken: 'another-secret', password: 'x' },
    });
    const body = (await get('/v1/platform/audit?action=test.bulk', platform)).payload;
    assert.ok(!body.includes('plain-secret-value'));
    assert.ok(!body.includes('another-secret'));
    assert.match(body, /\[redacted\]/);
  });
});

describe('filters', () => {
  it('filters by college, by action, and by time range', async () => {
    const { platform, a, b } = await world();
    const byCollege = (await get(`/v1/platform/audit?college=${a}`, platform)).json().data.events as any[];
    assert.ok(byCollege.length > 0 && byCollege.every((e) => e.college?.id === a));
    assert.ok(!byCollege.some((e) => e.college?.id === b));

    const byAction = (await get('/v1/platform/audit?action=institution.provisioned', platform)).json().data.events as any[];
    assert.equal(byAction.length, 2);

    await insertPlatformEvents(3, '2026-01-15T10:00:00Z');
    const ranged = (await get(
      '/v1/platform/audit?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z', platform,
    )).json().data.events as any[];
    assert.equal(ranged.length, 3);
    const outside = (await get(
      '/v1/platform/audit?from=2026-01-16T00:00:00Z&to=2026-01-17T00:00:00Z', platform,
    )).json().data.events as any[];
    assert.equal(outside.length, 0);
  });

  it('refuses malformed filters safely', async () => {
    const { platform } = await world();
    for (const q of [
      'college=not-a-uuid', 'action=DROP%20TABLE', 'from=yesterday', 'limit=0', 'limit=101',
      'cursor=bm90LWEtY3Vyc29y', 'from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z',
    ]) {
      const res = await get(`/v1/platform/audit?${q}`, platform);
      assert.equal(res.statusCode, 422, q);
    }
  });
});

describe('pagination', () => {
  it('pages newest first, stable on ties, with no gaps or repeats, and a default page size', async () => {
    const { platform } = await world();
    // 120 events at one identical instant: ordering must still be total.
    await insertPlatformEvents(120, '2026-03-01T09:00:00.123456Z');

    const first = (await get('/v1/platform/audit?action=test.bulk', platform)).json().data;
    assert.equal(first.events.length, 50, 'default page');
    assert.ok(first.next_cursor);

    const seen: string[] = first.events.map((e: any) => e.id);
    let cursor = first.next_cursor as string | null;
    while (cursor) {
      const page = (await get(`/v1/platform/audit?action=test.bulk&limit=100&cursor=${cursor}`, platform)).json().data;
      seen.push(...page.events.map((e: any) => e.id));
      cursor = page.next_cursor;
    }
    assert.equal(seen.length, 120);
    assert.equal(new Set(seen).size, 120, 'no repeats');
  });

  it('is not disturbed by events that arrive while someone pages', async () => {
    const { platform } = await world();
    await insertPlatformEvents(30, '2026-03-01T09:00:00Z');
    const first = (await get('/v1/platform/audit?action=test.bulk&limit=10', platform)).json().data;
    await insertPlatformEvents(5, new Date().toISOString());
    const second = (await get(`/v1/platform/audit?action=test.bulk&limit=10&cursor=${first.next_cursor}`, platform)).json().data;
    const firstIds = new Set(first.events.map((e: any) => e.id));
    assert.ok(second.events.every((e: any) => !firstIds.has(e.id)), 'no repeat after new inserts');
    assert.ok(
      second.events.every((e: any) => e.at <= first.events[first.events.length - 1].at),
      'the second page continues where the first stopped',
    );
  });
});

/**
 * AD-70, college branding (migration 024).
 *
 * What matters: the app reads a usable college's name, logo and colour by its
 * code without signing in, and learns nothing about unusable ones; the
 * platform and the College Admin can change them, validated, version-pinned
 * and audited; a platform session cannot use the college's own endpoint.
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

type Res = LightMyRequestResponse;
const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<Res>;

const NOT_FOUND = 'No college uses that code. Check it with your college.';

async function setup(branding: { logo_url?: string | null; brand_color?: string | null } = {}) {
  const owner = await seedPlatformAccount();
  const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
  const prov = await call('POST', '/v1/institutions', platform, {
    code: 'brand-test',
    name: 'Branding Test College',
    ...branding,
    admin: { full_name: 'Priya Sharma', email: 'priya@testcollege.edu' },
  });
  assert.equal(prov.statusCode, 201, prov.body);
  const data = prov.json().data;
  return {
    platform,
    college: data.institution as { id: string; code: string },
    invitation: data.invitation.token as string,
  };
}

async function activateAdmin(code: string, token: string): Promise<string> {
  const accepted = await call('POST', '/v1/auth/accept-invite', undefined, {
    institution_code: code, token, password: 'admin-strong-99',
  });
  assert.equal(accepted.statusCode, 200);
  const login = await call('POST', '/v1/auth/login', undefined, {
    institution_code: code, identifier: 'priya@testcollege.edu', password: 'admin-strong-99',
  });
  assert.equal(login.statusCode, 200);
  return login.json().data.access_token as string;
}

async function auditRows(action: string) {
  const pool = createPool(MIGRATOR_URL);
  try {
    return (await pool.query('SELECT * FROM audit_events WHERE action = $1 ORDER BY occurred_at', [action])).rows;
  } catch {
    return (await pool.query('SELECT * FROM audit_events WHERE action = $1', [action])).rows;
  } finally {
    await pool.end();
  }
}

describe('public lookup by code', () => {
  it("returns a usable college's name, logo and colour without signing in", async () => {
    const { college } = await setup({ logo_url: 'https://cdn.test/logo.png', brand_color: '#1e3a8a' });
    const res = await call('GET', `/v1/public/colleges/${college.code}`);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().data, {
      code: 'brand-test', name: 'Branding Test College',
      logo_url: 'https://cdn.test/logo.png', brand_color: '#1E3A8A',
    });
    assert.equal((await call('GET', '/v1/public/colleges/BRAND-TEST')).statusCode, 200, 'codes are case-insensitive');
  });

  it('gives unknown, malformed and suspended colleges one and the same answer', async () => {
    const { platform, college } = await setup();
    for (const code of ['no-such-college', 'x', '%20']) {
      const res = await call('GET', `/v1/public/colleges/${code}`);
      assert.equal(res.statusCode, 404);
      assert.equal(res.json().error.message, NOT_FOUND);
    }
    const detail = (await call('GET', `/v1/institutions/${college.id}`, platform)).json().data;
    const suspended = await call('POST', `/v1/institutions/${college.id}/suspend`, platform, {
      version: detail.version, reason: 'Contract paused for review',
    });
    assert.equal(suspended.statusCode, 200);
    const res = await call('GET', `/v1/public/colleges/${college.code}`);
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.message, NOT_FOUND, 'a suspended college is not revealed');
  });
});

describe('the platform', () => {
  it('refuses a logo that is not https and a colour that is not #RRGGBB, naming each field', async () => {
    const owner = await seedPlatformAccount();
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const res = await call('POST', '/v1/institutions', platform, {
      code: 'brand-test', name: 'Branding Test College',
      logo_url: 'http://cdn.test/logo.png', brand_color: 'blue',
      admin: { full_name: 'Priya Sharma', email: 'priya@testcollege.edu' },
    });
    assert.notEqual(res.statusCode, 201);
    const fields = res.json().error.field_errors;
    assert.ok(fields.logo_url);
    assert.ok(fields.brand_color);
  });

  it('changes branding pinned to a version, and it is audited as the platform', async () => {
    const { platform, college } = await setup();
    const detail = (await call('GET', `/v1/institutions/${college.id}`, platform)).json().data;
    assert.equal(detail.logo_url, null);

    const changed = await call('POST', `/v1/institutions/${college.id}/branding`, platform, {
      version: detail.version, name: 'Sunrise College', logo_url: 'https://cdn.test/sunrise.png', brand_color: '#0f766e',
    });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json().data.name, 'Sunrise College');
    assert.equal(changed.json().data.brand_color, '#0F766E');

    const stale = await call('POST', `/v1/institutions/${college.id}/branding`, platform, {
      version: detail.version, name: 'Another Name', logo_url: null, brand_color: null,
    });
    assert.equal(stale.json().error.code, 'CONFLICT');

    const [row] = await auditRows('institution.branding_changed');
    assert.equal(row.actor_type, 'platform');
    assert.equal(row.before_state.name, 'Branding Test College');
    assert.equal(row.after_state.logo_url, 'https://cdn.test/sunrise.png');
  });
});

describe('the College Admin', () => {
  it('reads and changes their own college, audited as a person, and the app sees it', async () => {
    const { college, invitation } = await setup();
    const admin = await activateAdmin(college.code, invitation);

    const profile = await call('GET', '/v1/college/profile', admin);
    assert.equal(profile.statusCode, 200);
    assert.equal(profile.json().data.code, 'brand-test');

    const changed = await call('POST', '/v1/college/profile', admin, {
      version: profile.json().data.version, name: 'Branding Test College',
      logo_url: 'https://cdn.test/crest.png', brand_color: '#1D4ED8',
    });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json().data.logo_url, 'https://cdn.test/crest.png');

    const seen = (await call('GET', `/v1/public/colleges/${college.code}`)).json().data;
    assert.equal(seen.logo_url, 'https://cdn.test/crest.png');
    assert.equal(seen.brand_color, '#1D4ED8');

    const [row] = await auditRows('institution.branding_changed');
    assert.equal(row.actor_type, 'person');
    assert.equal(row.tenant_id, college.id);
  });

  it('refuses without a college session: nobody signed in, or a platform session', async () => {
    const { platform } = await setup();
    assert.equal((await call('GET', '/v1/college/profile')).statusCode, 401);
    assert.equal((await call('POST', '/v1/college/profile', platform, {
      version: 1, name: 'Hijack', logo_url: null, brand_color: null,
    })).statusCode, 401);
  });
});

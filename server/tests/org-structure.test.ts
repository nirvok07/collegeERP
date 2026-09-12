/**
 * M2 — the organisational tree. The rules here exist so that scope means
 * something: a department a person holds authority over cannot quietly vanish.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';

let harness: TestApp;

before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

async function college(code = 'org-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Org College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const signedIn = (await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99' },
  })) as LightMyRequestResponse;
  return {
    code,
    token: signedIn.json().data.access_token as string,
    personId: prov.body.data.administrator.person_id as string,
  };
}

const as = (t: string) => ({ authorization: `Bearer ${t}` });
const get = (url: string, t: string) =>
  harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t: string, payload: unknown) =>
  harness.app.inject({ method: 'POST', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const patch = (url: string, t: string, payload: unknown) =>
  harness.app.inject({ method: 'PATCH', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;

describe('campuses', () => {
  it('provisioning leaves exactly one default campus', async () => {
    const c = await college();
    const res = await get('/v1/campuses', c.token);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.length, 1);
    assert.equal(res.json().data[0].is_default, true);
    assert.equal(res.json().data[0].department_count, 0);
  });

  it('creates an additional campus, which is never the default', async () => {
    const c = await college();
    const res = await post('/v1/campuses', c.token, { name: 'North Campus', code: 'north' });
    assert.equal(res.statusCode, 201);

    const list = await get('/v1/campuses', c.token);
    const north = list.json().data.find((x: { code: string }) => x.code === 'north');
    assert.equal(north.is_default, false, 'only provisioning creates the default');
  });

  it('refuses a duplicate code among active campuses', async () => {
    const c = await college();
    await post('/v1/campuses', c.token, { name: 'North', code: 'north' });
    const again = await post('/v1/campuses', c.token, { name: 'North Two', code: 'north' });
    assert.equal(again.statusCode, 409);
    assert.ok(again.json().error.field_errors.code);
  });

  it('refuses to archive the main campus', async () => {
    const c = await college();
    const list = await get('/v1/campuses', c.token);
    const main = list.json().data[0];
    const res = await post(`/v1/campuses/${main.id}/archive`, c.token, { reason: 'tidying up' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /main campus/i);
  });

  it('refuses to archive a campus that still has departments', async () => {
    const c = await college();
    const campus = (await post('/v1/campuses', c.token, { name: 'North', code: 'north' })).json().data.id;
    await post('/v1/departments', c.token, { campus_id: campus, name: 'Physics', code: 'phy' });

    const res = await post(`/v1/campuses/${campus}/archive`, c.token, { reason: 'closing' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /1 active department/);
  });
});

describe('departments', () => {
  it('creates a department under a campus and lists it with its campus name', async () => {
    const c = await college();
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const created = await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Computer Science', code: 'cse',
    });
    assert.equal(created.statusCode, 201);

    const list = await get('/v1/departments', c.token);
    assert.equal(list.json().data.length, 1);
    assert.equal(list.json().data[0].name, 'Computer Science');
    assert.equal(list.json().data[0].campus_name, campus.name);
  });

  it('rejects an unknown or archived campus without confirming which', async () => {
    const c = await college();
    const res = await post('/v1/departments', c.token, {
      campus_id: crypto.randomUUID(), name: 'Ghost', code: 'ghost',
    });
    assert.equal(res.statusCode, 422);
    assert.ok(res.json().error.field_errors.campusId);
  });

  it('renames without touching the code, which other records already reference', async () => {
    const c = await college();
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const id = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Comp Sci', code: 'cse',
    })).json().data.id;

    const res = await patch(`/v1/departments/${id}`, c.token, { name: 'Computer Science' });
    assert.equal(res.statusCode, 200);

    const list = await get('/v1/departments', c.token);
    assert.equal(list.json().data[0].name, 'Computer Science');
    assert.equal(list.json().data[0].code, 'cse', 'the code is stable');
  });

  it('archives a department and drops it from the default listing', async () => {
    const c = await college();
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const id = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Mechanical', code: 'mech',
    })).json().data.id;

    const res = await post(`/v1/departments/${id}/archive`, c.token, { reason: 'Merged into Civil' });
    assert.equal(res.statusCode, 200);

    assert.equal((await get('/v1/departments', c.token)).json().data.length, 0);
    assert.equal((await get('/v1/departments?archived=true', c.token)).json().data.length, 1,
      'the record persists, so history still resolves');
  });

  it('frees the code for reuse once archived', async () => {
    const c = await college();
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const id = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Mechanical', code: 'mech',
    })).json().data.id;
    await post(`/v1/departments/${id}/archive`, c.token, { reason: 'Merged' });

    const reused = await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Mechanical Engineering', code: 'mech',
    });
    assert.equal(reused.statusCode, 201, 'an archived code is not reserved forever');
  });

  it('requires a reason to archive, so the audit trail is never blank', async () => {
    const c = await college();
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const id = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Civil', code: 'civil',
    })).json().data.id;

    const res = await post(`/v1/departments/${id}/archive`, c.token, { reason: '' });
    assert.equal(res.statusCode, 422);
  });
});

describe('the tree protects authority scoped to it', () => {
  it('refuses to archive a department someone holds access to, and names them', async () => {
    const c = await college('protect-college');
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const departmentId = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Computer Science', code: 'cse',
    })).json().data.id;

    // A department-scoped grant is now possible, because the department exists.
    const invited = await post('/v1/people', c.token, {
      full_name: 'Meena Iyer', email: 'meena@protect.edu', person_type: 'staff',
      role: { role_key: 'department_head', scope_type: 'department', scope_ref_id: departmentId },
    });
    assert.equal(invited.statusCode, 201, 'department scope is real once M2 provides the unit');

    const res = await post(`/v1/departments/${departmentId}/archive`, c.token, { reason: 'restructure' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /Meena Iyer/, 'names who, not just how many');
    assert.match(res.json().error.message, /Remove or move that access first/);
  });

  it('allows the archive once that access is removed', async () => {
    const c = await college('unblock-college');
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const departmentId = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Physics', code: 'phy',
    })).json().data.id;
    await post('/v1/people', c.token, {
      full_name: 'Ravi Kumar', email: 'ravi@unblock.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'department', scope_ref_id: departmentId },
    });

    const assignment = (await get('/v1/assignments', c.token)).json().data
      .find((a: { person_name: string }) => a.person_name === 'Ravi Kumar');
    await post(`/v1/assignments/${assignment.id}/revoke`, c.token, { reason: 'Left the department' });

    const res = await post(`/v1/departments/${departmentId}/archive`, c.token, { reason: 'restructure' });
    assert.equal(res.statusCode, 200);
  });
});

describe('authorization and isolation', () => {
  it('a faculty member cannot create a campus or a department', async () => {
    const c = await college('perm-college');
    const campus = (await get('/v1/campuses', c.token)).json().data[0];
    const departmentId = (await post('/v1/departments', c.token, {
      campus_id: campus.id, name: 'Chemistry', code: 'chem',
    })).json().data.id;

    const invited = await post('/v1/people', c.token, {
      full_name: 'Plain Faculty', email: 'plain@perm.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'department', scope_ref_id: departmentId },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: c.code, token: invited.json().data.invitation.token,
        password: 'plain-strong-99',
      },
    });
    const signedIn = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: c.code, identifier: 'plain@perm.edu', password: 'plain-strong-99' },
    })) as LightMyRequestResponse;
    const facultyToken = signedIn.json().data.access_token;

    assert.equal((await post('/v1/campuses', facultyToken, { name: 'X', code: 'x' })).statusCode, 403);
    assert.equal(
      (await post('/v1/departments', facultyToken, { campus_id: campus.id, name: 'X', code: 'x' })).statusCode,
      403,
    );
  });

  it('one college never sees another college tree', async () => {
    const a = await college('alpha-org');
    const b = await college('beta-org');
    const campusB = (await get('/v1/campuses', b.token)).json().data[0];
    await post('/v1/departments', b.token, { campus_id: campusB.id, name: 'Beta Dept', code: 'beta' });

    const seen = await get('/v1/departments', a.token);
    assert.deepEqual(seen.json().data, [], 'tenant isolation holds across the tree');
  });
});

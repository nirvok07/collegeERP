/**
 * M11 Student Finance, FEE-1: fee heads and structures.
 *
 * What matters: only fee.manage composes a structure, only a complete draft
 * can be published, publication is irreversible, and a published structure
 * cannot be quietly edited afterward. See
 * docs/blueprint/modules/m11-student-finance.md for the module contract.
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

const as = (t: string) => ({ authorization: `Bearer ${t}` });
const get = (url: string, t: string) =>
  harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t: string, body: unknown = {}) =>
  harness.app.inject({ method: 'POST', url, headers: as(t), payload: body as never }) as Promise<LightMyRequestResponse>;
const del = (url: string, t: string) =>
  harness.app.inject({ method: 'DELETE', url, headers: as(t) }) as Promise<LightMyRequestResponse>;

async function login(institutionCode: string, identifier: string, password: string) {
  return ((await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: institutionCode, identifier, password },
  })) as LightMyRequestResponse).json().data.access_token as string;
}

/** Appoints a staff person with the given role, accepts their invitation, and signs them in. */
async function appoint(
  code: string, admin: string,
  input: { name: string; email: string; roleKey: string; scopeType: string; scopeRefId?: string },
) {
  const invited = await post('/v1/people', admin, {
    full_name: input.name, email: input.email, person_type: 'staff',
    role: { role_key: input.roleKey, scope_type: input.scopeType, scope_ref_id: input.scopeRefId ?? null },
  });
  assert.equal(invited.statusCode, 201, JSON.stringify(invited.json()));
  const password = 'staff-strong-99';
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: invited.json().data.invitation.token, password },
  });
  return login(code, input.email, password);
}

/** A college with a program and an academic year, ready for a fee structure. */
async function feeSetup(code = 'fee-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const platformLogin = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, platformLogin.body.data.access_token, {
    code, name: 'Fee College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const admin = await login(code, `admin@${code}.edu`, 'admin-strong-99');

  const campus = (await get('/v1/campuses', admin)).json().data[0].id;
  const department = (await post('/v1/departments', admin, {
    campus_id: campus, name: 'Computer Science', code: 'cse',
  })).json().data.id;
  const program = (await post('/v1/programs', admin, {
    department_id: department, name: 'B.Tech CSE', code: 'btech-cse', duration_years: 4, term_type: 'semester',
  })).json().data.id;
  const year = (await post('/v1/academic-years', admin, {
    name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true,
  })).json().data.id;

  return { code, admin, campus, department, program, year };
}

describe('FEE-1: fee heads', () => {
  it('an Accountant creates, lists and archives a fee head; a duplicate code is refused', async () => {
    const s = await feeSetup();
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });

    const created = await post('/v1/fees/heads', accountant, { name: 'Tuition fee', code: 'tuition' });
    assert.equal(created.statusCode, 201);
    const headId = created.json().data.id as string;

    const dup = await post('/v1/fees/heads', accountant, { name: 'Tuition again', code: 'TUITION' });
    assert.equal(dup.statusCode, 409, 'the code is normalised and unique per college');

    const listed = (await get('/v1/fees/heads', accountant)).json().data as Array<{ id: string; code: string }>;
    assert.deepEqual(listed.map((h) => h.code), ['TUITION']);

    assert.equal((await del(`/v1/fees/heads/${headId}`, accountant)).statusCode, 200);
    assert.deepEqual((await get('/v1/fees/heads', accountant)).json().data, []);
    assert.equal((await del(`/v1/fees/heads/${headId}`, accountant)).statusCode, 404, 'already archived');
  });

  it('a Cashier can read fees but not manage them; a teacher can do neither', async () => {
    const s = await feeSetup();
    const cashier = await appoint(s.code, s.admin, {
      name: 'Rohit Nair', email: `rohit@${s.code}.edu`, roleKey: 'cashier', scopeType: 'institution',
    });
    assert.equal((await get('/v1/fees/heads', cashier)).statusCode, 200);
    assert.equal((await post('/v1/fees/heads', cashier, { name: 'Lab fee', code: 'lab' })).statusCode, 403);

    const teacher = await appoint(s.code, s.admin, {
      name: 'Meera Iyer', email: `meera@${s.code}.edu`,
      roleKey: 'faculty', scopeType: 'department', scopeRefId: s.department,
    });
    assert.equal((await get('/v1/fees/heads', teacher)).statusCode, 403);
    assert.equal((await post('/v1/fees/heads', teacher, { name: 'Lab fee', code: 'lab' })).statusCode, 403);
  });
});

describe('FEE-1: fee structures', () => {
  async function head(admin: string, name: string, code: string) {
    return (await post('/v1/fees/heads', admin, { name, code })).json().data.id as string;
  }

  it('composes a draft, refuses an incomplete publish, then publishes once complete', async () => {
    const s = await feeSetup();
    const tuition = await head(s.admin, 'Tuition fee', 'tuition');

    const draft = await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    });
    assert.equal(draft.statusCode, 201);
    const structureId = draft.json().data.id as string;

    const again = await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    });
    assert.equal(again.statusCode, 409, 'one live structure per program per year');

    const emptyPublish = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(emptyPublish.statusCode, 422);
    assert.match(emptyPublish.json().error.message, /at least one instalment/);

    const instalment = await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 1, due_date: '2026-07-01', late_fee_paise: 50000,
    });
    assert.equal(instalment.statusCode, 201);
    const instalmentId = instalment.json().data.id as string;

    const noLines = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(noLines.statusCode, 422);
    assert.match(noLines.json().error.message, /Instalment 1 has no fee heads/);

    assert.equal((await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, {
      fee_head_id: tuition, amount_paise: 5000000,
    })).statusCode, 201);

    const published = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(published.statusCode, 200);

    const read = (await get(`/v1/fees/structures/${structureId}`, s.admin)).json().data;
    assert.equal(read.status, 'published');
    assert.equal(read.total_paise, 5000000);
    assert.equal(read.instalments[0].lines[0].amount_paise, 5000000);

    // Publication is the point of no return: nothing more may be added.
    const lateAdd = await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 2, due_date: '2026-09-01',
    });
    assert.equal(lateAdd.statusCode, 409);
    assert.match(lateAdd.json().error.message, /already published/);

    const lateLine = await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, {
      fee_head_id: tuition, amount_paise: 100,
    });
    assert.equal(lateLine.statusCode, 409);

    const republish = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(republish.statusCode, 409);
  });
});

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import { buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp } from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);
const CODE = 'sylldebug';
const as = (t?: string) => (t ? { authorization: `Bearer ${t}` } : {});
const get = (url: string, t?: string) => harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t?: string, payload: unknown = {}) => harness.app.inject({ method: 'POST', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const login = (i: string, p: string) => post('/v1/auth/login', undefined, { institution_code: CODE, identifier: i, password: p });

describe('root-cause', () => {
  it('provision + repo list + parseMultipart', async () => {
    const owner = await seedPlatformAccount('owner+sylldebug@nirvok.com');
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'a@sylldebug.edu' });
    await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99' });
    const admin = (await login('a@sylldebug.edu', 'admin-strong-99')).json().data.access_token as string;

    // Who am I → tenant + person id.
    const me = await get('/v1/auth/me', admin);
    console.log('ME', me.statusCode, me.body.slice(0, 300));
    const meData = me.json().data;
    console.log('ME-data-raw', JSON.stringify(meData).slice(0, 400));

    const campus = (await get('/v1/campuses', admin)).json().data[0].id;
    const department = (await post('/v1/departments', admin, { campus_id: campus, name: 'CS', code: 'cs' })).json().data.id;
    const program = (await post('/v1/programs', admin, { department_id: department, name: 'BTech', code: 'bt', duration_years: 4, term_type: 'semester' })).json().data.id;
    const year = (await post('/v1/academic-years', admin, { name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31' })).json().data.id;
    const term = (await post('/v1/terms', admin, { academic_year_id: year, sequence: 1, name: 'S1', starts_on: '2026-06-01', ends_on: '2026-11-30' })).json().data.id;
    const section = (await post('/v1/sections', admin, { program_id: program, term_id: term, term_number: 1, label: 'A', capacity: 60 })).json().data.id;
    await post(`/v1/sections/${section}/status`, admin, { status: 'open' });
    await post(`/v1/sections/${section}/status`, admin, { status: 'active' });
    const course = (await post('/v1/courses', admin, { code: 'CS101', title: 'Prog' })).json().data.id;

    const tenantId = meData.institution?.id ?? meData.tenant_id ?? meData.tenantId;
    const personId = meData.person?.id ?? meData.person_id ?? meData.sub ?? meData.id;
    console.log('RESOLVED tenant=', tenantId, 'person=', personId);

    // Direct repo call to surface the real SQL error.
    const deps = harness.container.syllabus;
    try {
      const list = await deps.uow.run(tenantId, (tx) =>
        deps.syllabus.listForActor(tx, tenantId, personId, 'all'),
      );
      console.log('REPO-LIST-OK', JSON.stringify(list));
    } catch (e) {
      console.log('REPO-LIST-ERR', (e as Error).message);
    }

    // Infra: does the container's role for admin include syllabus.upload?
    const authority = await harness.container.authority.authorityFor(tenantId, personId);
    console.log('PERMS', JSON.stringify(harness.container.authority.permissions(authority)));

    assert.ok(true);
  });
});
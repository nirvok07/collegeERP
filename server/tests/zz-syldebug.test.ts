import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import { buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp } from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);
const CODE = 'syll-college';
const as = (t?: string) => (t ? { authorization: `Bearer ${t}` } : {});
const get = (url: string, t?: string) => harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t?: string, payload: unknown = {}) => harness.app.inject({ method: 'POST', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const login = (i: string, p: string) => post('/v1/auth/login', undefined, { institution_code: CODE, identifier: i, password: p });
function multipart(fields: Record<string, string>, file: { filename: string; contentType: string; bytes: Buffer }) {
  const boundary = '----syldebug'; const c: Buffer[] = []; const push = (s: string) => c.push(Buffer.from(s));
  for (const [k, v] of Object.entries(fields)) { push(`--${boundary}\r\n`); push(`Content-Disposition: form-data; name="${k}"\r\n\r\n`); push(`${v}\r\n`); }
  push(`--${boundary}\r\n`); push(`Content-Disposition: form-data; name="pdf"; filename="${file.filename}"\r\n`); push(`Content-Type: ${file.contentType}\r\n\r\n`);
  c.push(file.bytes); push('\r\n'); push(`--${boundary}--\r\n`);
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(c) };
}
const PDF = Buffer.from('%PDF-1.4% bytes');
async function upload(t: string, fields: Record<string, string>) {
  const r = multipart(fields, { filename: 's.pdf', contentType: 'application/pdf', bytes: PDF });
  return harness.app.inject({ method: 'POST', url: '/v1/syllabus/upload', headers: { ...as(t), ...r.headers }, payload: r.body }) as Promise<LightMyRequestResponse>;
}
describe('debug', () => {
  it('inspect responses', async () => {
    const owner = await seedPlatformAccount('owner+x@nirvok.com');
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'admin@x.edu' });
    await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99' });
    const admin = (await login('admin@x.edu', 'admin-strong-99')).json().data.access_token as string;
    const campus = (await get('/v1/campuses', admin)).json().data[0].id;
    const department = (await post('/v1/departments', admin, { campus_id: campus, name: 'CS', code: 'cse' })).json().data.id;
    const program = (await post('/v1/programs', admin, { department_id: department, name: 'BTech', code: 'bt', duration_years: 4, term_type: 'semester' })).json().data.id;
    const year = (await post('/v1/academic-years', admin, { name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true })).json().data.id;
    const term = (await post('/v1/terms', admin, { academic_year_id: year, sequence: 1, name: 'S1', starts_on: '2026-06-01', ends_on: '2026-11-30' })).json().data.id;
    const section = (await post('/v1/sections', admin, { program_id: program, term_id: term, term_number: 1, label: 'A', capacity: 60 })).json().data.id;
    await post(`/v1/sections/${section}/status`, admin, { status: 'open' });
    await post(`/v1/sections/${section}/status`, admin, { status: 'active' });
    const course = (await post('/v1/courses', admin, { code: 'CS101', title: 'Prog' })).json().data.id;
    const offering = (await post('/v1/offerings', admin, { section_id: section, course_id: course })).json().data.id;
    const invited = await post('/v1/people', admin, { full_name: 'Asha', email: 'asha@x.edu', person_type: 'staff', role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: section } });
    await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: invited.json().data.invitation.token, password: 'staff-strong-99' });
    const teacher = (await login('asha@x.edu', 'staff-strong-99')).json().data.access_token as string;
    await post(`/v1/offerings/${offering}/instructors`, admin, { person_id: invited.json().data.person_id, role: 'lead' });

    const up1 = await upload(admin, { course_id: course, academic_year_id: year });
    console.log('UPLOAD1', up1.statusCode, up1.body.slice(0, 160));
    const listAdmin = await get('/v1/syllabus', admin);
    console.log('LIST-ADMIN', listAdmin.statusCode, listAdmin.body.slice(0, 160));
    const listTeacher = await get('/v1/syllabus', teacher);
    console.log('LIST-TEACHER', listTeacher.statusCode, listTeacher.body.slice(0, 300));
    const dlTeacher = await get('/v1/syllabus/' + up1.json().data.id + '/download', teacher);
    console.log('DL-TEACHER', dlTeacher.statusCode, dlTeacher.body.slice(0, 160));
    assert.ok(true);
  });
});
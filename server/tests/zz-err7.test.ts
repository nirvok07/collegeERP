import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import { buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp } from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);
const CODE = 'syl-err7';
const as = (t?: string) => (t ? { authorization: `Bearer ${t}` } : {});
const post = (url: string, t?: string, payload: unknown = {}) => harness.app.inject({ method: 'POST', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const login = (i: string, p: string) => post('/v1/auth/login', undefined, { institution_code: CODE, identifier: i, password: p });

function multipart(fields: Record<string, string>, file: { filename: string; contentType: string; bytes: Buffer }) {
  const boundary = '----syllabusTestBoundary';
  const chunks: Buffer[] = [];
  const push = (s: string) => chunks.push(Buffer.from(s));
  for (const [k, v] of Object.entries(fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${k}"\r\n\r\n`);
    push(`${v}\r\n`);
  }
  push(`--${boundary}\r\n`);
  push(`Content-Disposition: form-data; name="pdf"; filename="${file.filename}"\r\n`);
  push(`Content-Type: ${file.contentType}\r\n\r\n`);
  chunks.push(file.bytes);
  push('\r\n');
  push(`--${boundary}--\r\n`);
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(chunks) };
}
const PDF = Buffer.from('%PDF-1.4% test bytes');

describe('error debug7', () => {
  it('trace route with debug log', async () => {
    const owner = await seedPlatformAccount('owner+syl-err7@nirvok.com');
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'a@syl-err7.edu' });
    await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99' });
    const admin = (await login('a@syl-err7.edu', 'admin-strong-99')).json().data.access_token as string;

    const campus = (await harness.app.inject({ method: 'GET', url: '/v1/campuses', headers: as(admin) })).json().data[0].id;
    const department = (await post('/v1/departments', admin, { campus_id: campus, name: 'CS', code: 'cs' })).json().data.id;
    const program = (await post('/v1/programs', admin, { department_id: department, name: 'BTech', code: 'bt', duration_years: 4, term_type: 'semester' })).json().data.id;
    const year = (await post('/v1/academic-years', admin, { name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31' })).json().data.id;
    const course = (await post('/v1/courses', admin, { code: 'CS101', title: 'Prog' })).json().data.id;

    const req = multipart({ course_id: course, academic_year_id: year }, { filename: 's.pdf', contentType: 'application/pdf', bytes: PDF });
    const up = await harness.app.inject({
      method: 'POST', url: '/v1/syllabus/upload',
      headers: { ...as(admin), ...req.headers },
      payload: req.body,
    });
    console.log('UPLOAD', up.statusCode, up.body);

    // Try GET /v1/syllabus
    const list = await harness.app.inject({ method: 'GET', url: '/v1/syllabus', headers: as(admin) });
    console.log('LIST', list.statusCode, list.body);

    assert.ok(true);
  });
});
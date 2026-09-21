import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import { buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp } from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);
const CODE = 'syl-err5';
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

describe('error debug5', () => {
  it('trace with try-catch wrapper', async () => {
    const owner = await seedPlatformAccount('owner+syl-err5@nirvok.com');
    const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
    const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'a@syl-err5.edu' });
    await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99' });
    const admin = (await login('a@syl-err5.edu', 'admin-strong-99')).json().data.access_token as string;

    const campus = (await harness.app.inject({ method: 'GET', url: '/v1/campuses', headers: as(admin) })).json().data[0].id;
    const department = (await post('/v1/departments', admin, { campus_id: campus, name: 'CS', code: 'cs' })).json().data.id;
    const program = (await post('/v1/programs', admin, { department_id: department, name: 'BTech', code: 'bt', duration_years: 4, term_type: 'semester' })).json().data.id;
    const year = (await post('/v1/academic-years', admin, { name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31' })).json().data.id;
    const course = (await post('/v1/courses', admin, { code: 'CS101', title: 'Prog' })).json().data.id;

    // Call the service directly with the container
    const me = await harness.app.inject({ method: 'GET', url: '/v1/auth/me', headers: as(admin) });
    const meData = me.json().data;
    const tenantId = meData.tenant_id;
    const personId = meData.actor_id;

    try {
      const result = await harness.container.syllabus.uow.run(tenantId, async (tx) => {
        const deps = harness.container.syllabus;
        const id = deps.ids.next();
        const stored = await deps.media.upload({
          bytes: PDF,
          contentType: 'application/pdf',
          folder: `${tenantId}/syllabus`,
          fileName: `${id}.pdf`,
        });
        const upsert = await deps.syllabus.upsert(tx, {
          id, tenantId, courseId: course, academicYearId: year,
          mediaReference: stored.reference, fileName: 's.pdf', contentType: 'application/pdf',
          byteSize: PDF.length, uploadedBy: personId,
        });
        return { id, stored, upsert };
      });
      console.log('DIRECT SERVICE OK', result);
    } catch (e) {
      console.log('DIRECT SERVICE ERR', (e as Error).message, (e as Error).stack);
    }

    assert.ok(true);
  });
});
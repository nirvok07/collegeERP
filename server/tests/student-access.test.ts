/**
 * ST-1 (AD-69): a student's own sign-in and attendance. What matters: only an
 * administrator issues a code, a code opens only the account of the enrolment
 * number typed with it, the student then signs in with that number, a new code
 * replaces the old one, withdrawn students get none, and "my attendance"
 * counts submitted registers only and only for the student asking.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const CODE = 'student-college';
const as = (t?: string) => (t ? { authorization: `Bearer ${t}` } : {});
const get = (url: string, t?: string) =>
  harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t?: string, payload: unknown = {}) =>
  harness.app.inject({ method: 'POST', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const put = (url: string, t: string, payload: unknown) =>
  harness.app.inject({ method: 'PUT', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;
const patch = (url: string, t: string, payload: unknown) =>
  harness.app.inject({ method: 'PATCH', url, headers: as(t), payload: payload as never }) as Promise<LightMyRequestResponse>;

const login = (identifier: string, password: string) =>
  post('/v1/auth/login', undefined, { institution_code: CODE, identifier, password });
const activate = (enrolment: string, code: string, password: string) =>
  post('/v1/auth/student-activate', undefined, { institution_code: CODE, enrolment_number: enrolment, code, password });

async function college() {
  const owner = await seedPlatformAccount();
  const platform = (await signInPlatform(harness.app, owner.email, owner.password)).body.data.access_token as string;
  const prov = await provisionCollege(harness.app, platform, { code: CODE, adminEmail: 'admin@student.edu' });
  await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: prov.body.data.invitation.token, password: 'admin-strong-99' });
  const admin = (await login('admin@student.edu', 'admin-strong-99')).json().data.access_token as string;

  const campus = (await get('/v1/campuses', admin)).json().data[0].id;
  const department = (await post('/v1/departments', admin, { campus_id: campus, name: 'Computer Science', code: 'cse' })).json().data.id;
  const program = (await post('/v1/programs', admin, {
    department_id: department, name: 'B.Tech CSE', code: 'btech-cse', duration_years: 4, term_type: 'semester',
  })).json().data.id;
  const year = (await post('/v1/academic-years', admin, {
    name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true,
  })).json().data.id;
  const term = (await post('/v1/terms', admin, {
    academic_year_id: year, sequence: 1, name: 'Semester 1', starts_on: '2026-06-01', ends_on: '2026-11-30',
  })).json().data.id;
  const section = (await post('/v1/sections', admin, { program_id: program, term_id: term, term_number: 1, label: 'A', capacity: 60 })).json().data.id;
  await post(`/v1/sections/${section}/status`, admin, { status: 'open' });
  await post(`/v1/sections/${section}/status`, admin, { status: 'active' });
  const course = (await post('/v1/courses', admin, { code: 'CS101', title: 'Programming' })).json().data.id;
  const offering = (await post('/v1/offerings', admin, { section_id: section, course_id: course })).json().data.id;

  const invited = await post('/v1/people', admin, {
    full_name: 'Asha Menon', email: 'asha@student.edu', person_type: 'staff',
    role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: section },
  });
  await post('/v1/auth/accept-invite', undefined, { institution_code: CODE, token: invited.json().data.invitation.token, password: 'staff-strong-99' });
  const teacher = (await login('asha@student.edu', 'staff-strong-99')).json().data.access_token as string;
  await post(`/v1/offerings/${offering}/instructors`, admin, { person_id: invited.json().data.person_id, role: 'lead' });

  async function admit(name: string, number: string) {
    const id = (await post('/v1/students', admin, {
      full_name: name, enrolment_number: number, program_id: program, admitted_on: '2026-06-01',
    })).json().data.id as string;
    await post(`/v1/sections/${section}/members`, admin, { student_id: id, from: '2026-06-01' });
    return id;
  }
  const nisha = await admit('Nisha Kumar', 'CSE26-001');
  const ravi = await admit('Ravi Nair', 'CSE26-002');

  /** A class taught and its register marked; submitted unless told otherwise. */
  async function register(date: string, marks: Array<[string, string]>, submit = true) {
    const session = (await post('/v1/sessions', admin, {
      offering_id: offering, session_date: date, starts_at: '09:00', ends_at: '10:00',
    })).json().data.id as string;
    const saved = await put(`/v1/sessions/${session}/attendance`, teacher, {
      version: 0, marks: marks.map(([student_id, state]) => ({ student_id, state })),
    });
    assert.ok(saved.statusCode < 300, saved.body);
    if (submit) {
      const version = (await get(`/v1/sessions/${session}/attendance`, teacher)).json().data.sheet.version;
      const done = await post(`/v1/sessions/${session}/attendance/submit`, teacher, { version });
      assert.ok(done.statusCode < 300, done.body);
    }
  }

  return { admin, teacher, nisha, ravi, register };
}

describe('student app access', () => {
  it('an administrator issues a code; it opens only that student\'s account; the student signs in by enrolment number', async () => {
    const c = await college();
    const issued = await post(`/v1/students/${c.nisha}/access`, c.admin);
    assert.equal(issued.statusCode, 201);
    const { code, kind, login_identifier } = issued.json().data;
    assert.equal(kind, 'activation');
    assert.equal(login_identifier, 'cse26-001');
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

    assert.equal((await activate('CSE26-002', code, 'nisha-strong-99')).statusCode, 401, 'another student\'s number');
    const done = await activate('cse26-001', code.replaceAll('-', '').toLowerCase(), 'nisha-strong-99');
    assert.equal(done.statusCode, 200, 'the number and code, however typed');
    assert.equal((await activate('CSE26-001', code, 'nisha-other-99')).statusCode, 401, 'a code works once');

    const session = await login('CSE26-001', 'nisha-strong-99');
    assert.equal(session.statusCode, 200);
    const me = (await get('/v1/auth/me', session.json().data.access_token)).json().data;
    assert.equal(me.student.enrolment_number, 'CSE26-001');
    assert.equal(me.student.section_label, 'A');
    assert.equal(me.has_access, false, 'no role: a student\'s surfaces are self-scoped');
  });

  it('a new code replaces the old one, and for an active student it resets the password', async () => {
    const c = await college();
    const first = (await post(`/v1/students/${c.nisha}/access`, c.admin)).json().data.code;
    const second = (await post(`/v1/students/${c.nisha}/access`, c.admin)).json().data.code;
    assert.equal((await activate('CSE26-001', first, 'nisha-strong-99')).statusCode, 401);
    assert.equal((await activate('CSE26-001', second, 'nisha-strong-99')).statusCode, 200);

    const reset = (await post(`/v1/students/${c.nisha}/access`, c.admin)).json().data;
    assert.equal(reset.kind, 'reset');
    assert.equal((await activate('CSE26-001', reset.code, 'nisha-new-pass-7')).statusCode, 200);
    assert.equal((await login('CSE26-001', 'nisha-strong-99')).statusCode, 401);
    assert.equal((await login('CSE26-001', 'nisha-new-pass-7')).statusCode, 200);
  });

  it('a teacher cannot issue access, and a withdrawn student gets none', async () => {
    const c = await college();
    assert.equal((await post(`/v1/students/${c.nisha}/access`, c.teacher)).statusCode, 403);
    assert.equal((await post(`/v1/students/${c.nisha}/access`)).statusCode, 401);
    await patch(`/v1/students/${c.ravi}/status`, c.admin, { status: 'withdrawn', reason: 'Moved away' });
    assert.equal((await post(`/v1/students/${c.ravi}/access`, c.admin)).statusCode, 409);
  });
});

describe('CAL-1: the academic calendar', () => {
  it('a student reads the college\'s holidays, and cannot add one', async () => {
    const c = await college();
    await post('/v1/non-teaching-days', c.admin, { on_date: '2026-08-15', label: 'Independence Day' });
    const code = (await post(`/v1/students/${c.nisha}/access`, c.admin)).json().data.code;
    await activate('CSE26-001', code, 'nisha-strong-99');
    const nisha = (await login('CSE26-001', 'nisha-strong-99')).json().data.access_token as string;

    const read = await get('/v1/calendar', nisha);
    assert.equal(read.statusCode, 200, read.body);
    assert.deepEqual(read.json().data.holidays.map((d: { label: string }) => d.label), ['Independence Day']);
    assert.equal((await post('/v1/non-teaching-days', nisha, { on_date: '2026-08-16', label: 'Mine' })).statusCode, 403);
  });
});

describe('my attendance', () => {
  it('counts submitted registers only, and only the student asking', async () => {
    const c = await college();
    await c.register('2026-06-02', [[c.nisha, 'present'], [c.ravi, 'absent']]);
    await c.register('2026-06-03', [[c.nisha, 'absent'], [c.ravi, 'present']]);
    await c.register('2026-06-04', [[c.nisha, 'late'], [c.ravi, 'present']]);
    await c.register('2026-06-05', [[c.nisha, 'excused'], [c.ravi, 'present']]);
    await c.register('2026-06-06', [[c.nisha, 'absent'], [c.ravi, 'absent']], false);

    const code = (await post(`/v1/students/${c.nisha}/access`, c.admin)).json().data.code;
    await activate('CSE26-001', code, 'nisha-strong-99');
    const nisha = (await login('CSE26-001', 'nisha-strong-99')).json().data.access_token as string;

    const mine = await get('/v1/me/attendance', nisha);
    assert.equal(mine.statusCode, 200);
    const data = mine.json().data;
    // Four submitted classes: present, absent, late, excused. The draft is not counted.
    assert.deepEqual(
      { present: data.overall.present, absent: data.overall.absent, late: data.overall.late, excused: data.overall.excused, total: data.overall.total },
      { present: 1, absent: 1, late: 1, excused: 1, total: 4 },
    );
    // Present and late attended, excused left out: 2 of 3.
    assert.equal(data.overall.percent, 66.7);
    assert.equal(data.courses.length, 1);
    assert.equal(data.courses[0].course.code, 'CS101');

    assert.equal((await get('/v1/me/attendance', c.admin)).statusCode, 403, 'not a student');
    assert.equal((await get('/v1/me/attendance')).statusCode, 401);
  });
});

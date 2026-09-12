/**
 * M7 Internal Assessment.
 *
 * The tests that matter most prove four things. A mark exists only for a
 * student enrolled in the course on the day the assessment was held, and never
 * above its maximum. Absent is not zero. A submitted sheet changes only by a
 * recorded correction the teacher cannot make. And a teacher records marks only
 * for courses they actually teach.
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
const send = (method: 'POST' | 'PUT' | 'PATCH', url: string, t: string, body: unknown = {}) =>
  harness.app.inject({ method, url, headers: as(t), payload: body as never }) as Promise<LightMyRequestResponse>;
const post = (url: string, t: string, body: unknown = {}) => send('POST', url, t, body);
const put = (url: string, t: string, body: unknown = {}) => send('PUT', url, t, body);
const patch = (url: string, t: string, body: unknown = {}) => send('PATCH', url, t, body);

/**
 * A college with one live cohort, one course, a teacher who leads it, a head of
 * the department, and two students placed from the first day of term.
 *
 * The term runs 1 June to 30 November 2026, which is in the past relative to
 * the system clock, so any date in it can be recorded as held.
 */
async function assessmentSetup(code = 'assess-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Assessment College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const token = ((await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99' },
  })) as LightMyRequestResponse).json().data.access_token as string;

  const campus = (await get('/v1/campuses', token)).json().data[0].id;
  const department = (await post('/v1/departments', token, {
    campus_id: campus, name: 'Computer Science', code: 'cse',
  })).json().data.id;
  const program = (await post('/v1/programs', token, {
    department_id: department, name: 'B.Tech CSE', code: 'btech-cse',
    duration_years: 4, term_type: 'semester',
  })).json().data.id;
  const year = (await post('/v1/academic-years', token, {
    name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true,
  })).json().data.id;
  const term = (await post('/v1/terms', token, {
    academic_year_id: year, sequence: 1, name: 'Semester 1',
    starts_on: '2026-06-01', ends_on: '2026-11-30',
  })).json().data.id;

  async function person(name: string, email: string, role: string, scopeType: string, scopeRef: string) {
    const invited = await post('/v1/people', token, {
      full_name: name, email, person_type: 'staff',
      role: { role_key: role, scope_type: scopeType, scope_ref_id: scopeRef },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: { institution_code: code, token: invited.json().data.invitation.token, password: 'staff-strong-99' },
    });
    const signedIn = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: code, identifier: email, password: 'staff-strong-99' },
    })) as LightMyRequestResponse;
    return {
      personId: invited.json().data.person_id as string,
      token: signedIn.json().data.access_token as string,
    };
  }

  async function cohort(label: string) {
    const id = (await post('/v1/sections', token, {
      program_id: program, term_id: term, term_number: 5, label, capacity: 60,
    })).json().data.id as string;
    await post(`/v1/sections/${id}/status`, token, { status: 'open' });
    await post(`/v1/sections/${id}/status`, token, { status: 'active' });
    return id;
  }

  async function course(codeName: string, title: string, sectionId: string) {
    const courseId = (await post('/v1/courses', token, { code: codeName, title })).json().data.id;
    return (await post('/v1/offerings', token, { section_id: sectionId, course_id: courseId }))
      .json().data.id as string;
  }

  async function admit(name: string, number: string, sectionId: string, from = '2026-06-01') {
    const created = (await post('/v1/students', token, {
      full_name: name, enrolment_number: number, program_id: program, admitted_on: '2026-06-01',
    })).json().data as { id: string };
    await post(`/v1/sections/${sectionId}/members`, token, { student_id: created.id, from });
    return created;
  }

  return { code, token, campus, department, program, year, term, person, cohort, course, admit };
}

/** The common shape: one course, a teacher, a head of department, two students. */
async function oneCourse(code = 'assess-college') {
  const s = await assessmentSetup(code);
  const section = await s.cohort('A');
  const offering = await s.course('CS301', 'Operating Systems', section);
  const teacher = await s.person('Asha Menon', `asha@${code}.edu`, 'faculty', 'section', section);
  await post(`/v1/offerings/${offering}/instructors`, s.token, {
    person_id: teacher.personId, role: 'lead',
  });
  const hod = await s.person('Rajan Iyer', `hod@${code}.edu`, 'department_head', 'department', s.department);
  const nisha = await s.admit('Nisha Kumar', 'cse2026-001', section);
  const ravi = await s.admit('Ravi Nair', 'cse2026-002', section);
  return { ...s, section, offering, teacher, hod, nisha, ravi };
}

/** Plans a component and returns its id and current version. */
async function plan(c: { token: string; offering: string }, over: Record<string, unknown> = {}) {
  const created = await post(`/v1/offerings/${c.offering}/assessments`, c.token, {
    name: 'Test 1', kind: 'test', max_marks: 50, weight: 20, ...over,
  });
  assert.equal(created.statusCode, 201, created.body);
  return created.json().data.id as string;
}

const versionOf = async (id: string, t: string) =>
  (await get(`/v1/assessments/${id}/sheet`, t)).json().data.component.version as number;

/** A component held on 10 June with both students scored, ready to submit. */
async function markedSheet(c: Awaited<ReturnType<typeof oneCourse>>) {
  const id = await plan(c);
  await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
    version: await versionOf(id, c.token), held_on: '2026-06-10',
  });
  const marked = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
    version: await versionOf(id, c.token),
    marks: [
      { student_id: c.nisha.id, status: 'scored', score: 42 },
      { student_id: c.ravi.id, status: 'absent' },
    ],
  });
  assert.equal(marked.statusCode, 200, marked.body);
  return id;
}

describe('the plan is the department\'s', () => {
  it('lets an administrator plan components and says how much weight is left', async () => {
    const c = await oneCourse();
    await plan(c, { name: 'Test 1', weight: 20 });
    await plan(c, { name: 'Assignment', kind: 'assignment', max_marks: 10, weight: 10 });

    const listed = (await get(`/v1/offerings/${c.offering}/assessments`, c.token)).json().data;
    assert.equal(listed.components.length, 2);
    assert.equal(listed.weight_total, 30);
    assert.equal(listed.weight_remaining, 70);
  });

  it('lets a head of department plan for a course in their department', async () => {
    const c = await oneCourse();
    const created = await post(`/v1/offerings/${c.offering}/assessments`, c.hod.token, {
      name: 'Lab record', kind: 'lab', max_marks: 25, weight: 15,
    });
    assert.equal(created.statusCode, 201);
  });

  it('does not let a teacher define the plan', async () => {
    const c = await oneCourse();
    const refused = await post(`/v1/offerings/${c.offering}/assessments`, c.teacher.token, {
      name: 'My own test', max_marks: 100, weight: 90,
    });
    assert.equal(refused.statusCode, 403);
  });

  it('refuses weights that would push a course past 100, naming the total', async () => {
    const c = await oneCourse();
    await plan(c, { name: 'Test 1', weight: 60 });
    const over = await post(`/v1/offerings/${c.offering}/assessments`, c.token, {
      name: 'Test 2', max_marks: 50, weight: 50,
    });
    assert.equal(over.statusCode, 422);
    assert.match(over.json().error.message, /would total 110, and/);
  });

  it('measures a revision without counting the component\'s own weight twice', async () => {
    const c = await oneCourse();
    await plan(c, { name: 'Test 1', weight: 60 });
    const second = await plan(c, { name: 'Test 2', weight: 30 });

    // 60 + 40 is exactly 100, which is allowed. Counting Test 2's old 30 as
    // well would wrongly make it 130.
    const raised = await patch(`/v1/assessments/${second}`, c.token, {
      version: await versionOf(second, c.token), name: 'Test 2', kind: 'test', max_marks: 50, weight: 40,
    });
    assert.equal(raised.statusCode, 200, raised.body);

    const over = await patch(`/v1/assessments/${second}`, c.token, {
      version: await versionOf(second, c.token), name: 'Test 2', kind: 'test', max_marks: 50, weight: 41,
    });
    assert.equal(over.statusCode, 422);
    assert.match(over.json().error.message, /would total 101, and/);
  });

  it('refuses two components with one name in one course', async () => {
    const c = await oneCourse();
    await plan(c, { name: 'Test 1' });
    const again = await post(`/v1/offerings/${c.offering}/assessments`, c.token, {
      name: 'test 1', max_marks: 50, weight: 10,
    });
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /already exists/);
  });

  it('allows half marks but not thirds', async () => {
    const c = await oneCourse();
    await plan(c, { name: 'Quiz', max_marks: 12.5, weight: 5 });
    const thirds = await post(`/v1/offerings/${c.offering}/assessments`, c.token, {
      name: 'Odd quiz', max_marks: 10.333, weight: 5,
    });
    assert.equal(thirds.statusCode, 422);
  });

  it('cancels a component that was never held, with a reason', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    const bare = await post(`/v1/assessments/${id}/cancel`, c.token, {
      version: await versionOf(id, c.token), reason: '',
    });
    assert.equal(bare.statusCode, 422);

    const cancelled = await post(`/v1/assessments/${id}/cancel`, c.token, {
      version: await versionOf(id, c.token), reason: 'Folded into Test 2',
    });
    assert.equal(cancelled.statusCode, 200);
    // A cancelled component frees its weight and its name.
    const listed = (await get(`/v1/offerings/${c.offering}/assessments`, c.token)).json().data;
    assert.equal(listed.weight_total, 0);
    assert.equal((await post(`/v1/offerings/${c.offering}/assessments`, c.token, {
      name: 'Test 1', max_marks: 50, weight: 20,
    })).statusCode, 201);
  });

  it('refuses to cancel a component that already has marks', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    const refused = await post(`/v1/assessments/${id}/cancel`, c.token, {
      version: await versionOf(id, c.token), reason: 'Changed our minds',
    });
    assert.equal(refused.statusCode, 409);
    assert.match(refused.json().error.message, /was held and cannot be cancelled/);
  });

  it('freezes maximum marks and weight once a mark exists', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    const revised = await patch(`/v1/assessments/${id}`, c.token, {
      version: await versionOf(id, c.token), name: 'Test 1', kind: 'test', max_marks: 40, weight: 20,
    });
    assert.equal(revised.statusCode, 409);
    assert.match(revised.json().error.message, /maximum marks, weight and date are fixed/);
  });
});

describe('a mark needs the day it was held', () => {
  it('refuses marks before a date is recorded', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    assert.equal(sheet.needs_date, true);
    assert.deepEqual(sheet.students, [], 'no date, so no roster');

    const marked = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: sheet.component.version,
      marks: [{ student_id: c.nisha.id, status: 'scored', score: 10 }],
    });
    assert.equal(marked.statusCode, 409);
    assert.match(marked.json().error.message, /Record when this assessment was held/);
  });

  it('refuses a date outside the term', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    // Before the term opens, and in the past, so only the term rule can refuse it.
    const outside = await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-05-15',
    });
    assert.equal(outside.statusCode, 422);
    assert.match(outside.json().error.message, /outside the term/);
  });

  it('refuses a date in the future', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    const future = await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2099-06-10',
    });
    assert.equal(future.statusCode, 422);
    assert.match(future.json().error.message, /once it has been held/);
  });

  it('takes the roster as of that day, not today', async () => {
    const c = await oneCourse();
    // Meera joins in July, after the June test.
    const meera = await c.admit('Meera Das', 'cse2026-003', c.section, '2026-07-01');
    const id = await plan(c);
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });

    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    assert.deepEqual(sheet.students.map((x: any) => x.enrolment_number), ['CSE2026-001', 'CSE2026-002']);

    const refused = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: sheet.component.version,
      marks: [{ student_id: meera.id, status: 'scored', score: 30 }],
    });
    assert.equal(refused.statusCode, 409);
    assert.match(refused.json().error.message, /not enrolled in this course on 2026-06-10/);
  });

  it('freezes the date once a mark exists, because the roster depends on it', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    const moved = await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-20',
    });
    assert.equal(moved.statusCode, 409);
  });
});

describe('entering marks', () => {
  it('records scored, absent and exempt, and keeps absent distinct from zero', async () => {
    const c = await oneCourse();
    const third = await c.admit('Meera Das', 'cse2026-003', c.section);
    const id = await plan(c);
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    const marked = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: await versionOf(id, c.token),
      marks: [
        { student_id: c.nisha.id, status: 'scored', score: 0 },
        { student_id: c.ravi.id, status: 'absent' },
        { student_id: third.id, status: 'exempt', note: 'Medical certificate' },
      ],
    });
    assert.equal(marked.statusCode, 200);

    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    const byNumber = Object.fromEntries(sheet.students.map((x: any) => [x.enrolment_number, x]));
    assert.equal(byNumber['CSE2026-001'].status, 'scored');
    assert.equal(byNumber['CSE2026-001'].score, 0, 'zero is a score');
    assert.equal(byNumber['CSE2026-002'].status, 'absent');
    assert.equal(byNumber['CSE2026-002'].score, null, 'absent is not zero');
    assert.equal(byNumber['CSE2026-003'].status, 'exempt');
    assert.deepEqual(sheet.summary, { scored: 1, absent: 1, exempt: 1, marked: 3, unmarked: 0, total: 3 });
  });

  it('accepts half marks', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    const marked = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: await versionOf(id, c.token),
      marks: [{ student_id: c.nisha.id, status: 'scored', score: 37.5 }],
    });
    assert.equal(marked.statusCode, 200);
    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    assert.equal(sheet.students[0].score, 37.5);
  });

  it('refuses a score above the maximum, and the whole batch with it', async () => {
    const c = await oneCourse();
    const id = await plan(c, { max_marks: 50 });
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    const over = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: await versionOf(id, c.token),
      marks: [
        { student_id: c.nisha.id, status: 'scored', score: 40 },
        { student_id: c.ravi.id, status: 'scored', score: 55 },
      ],
    });
    assert.equal(over.statusCode, 422);
    assert.match(over.json().error.message, /55 is more than the 50/);

    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    assert.equal(sheet.summary.marked, 0, 'sixty marks land together or not at all');
  });

  it('refuses a scored mark with no score, and an absent mark with one', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    const version = await versionOf(id, c.token);
    assert.equal((await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version, marks: [{ student_id: c.nisha.id, status: 'scored' }],
    })).statusCode, 422);
    assert.equal((await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version, marks: [{ student_id: c.nisha.id, status: 'absent', score: 10 }],
    })).statusCode, 422);
  });

  it('refuses a stale version, so two people on one sheet do not overwrite each other', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    const read = await versionOf(id, c.token);
    await put(`/v1/assessments/${id}/marks`, c.token, {
      version: read, marks: [{ student_id: c.nisha.id, status: 'scored', score: 40 }],
    });
    const second = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: read, marks: [{ student_id: c.ravi.id, status: 'scored', score: 30 }],
    });
    assert.equal(second.statusCode, 409);
    assert.match(second.json().error.message, /Somebody else changed this assessment/);
  });
});

describe('submitting and verifying a sheet', () => {
  it('refuses to submit while a student has no result', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: await versionOf(id, c.token),
      marks: [{ student_id: c.nisha.id, status: 'scored', score: 40 }],
    });
    const submitted = await post(`/v1/assessments/${id}/submit`, c.teacher.token, {
      version: await versionOf(id, c.token),
    });
    assert.equal(submitted.statusCode, 409);
    assert.match(submitted.json().error.message, /1 student has no result yet/);
  });

  it('submits a complete sheet, after which marks change only by correction', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    const submitted = await post(`/v1/assessments/${id}/submit`, c.teacher.token, {
      version: await versionOf(id, c.token),
    });
    assert.equal(submitted.statusCode, 200);

    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.teacher.token)).json().data;
    assert.equal(sheet.component.status, 'submitted');
    assert.equal(sheet.component.submitted_by, 'Asha Menon');
    assert.equal(sheet.can_mark, false);

    const after = await put(`/v1/assessments/${id}/marks`, c.teacher.token, {
      version: sheet.component.version,
      marks: [{ student_id: c.nisha.id, status: 'scored', score: 50 }],
    });
    assert.equal(after.statusCode, 409);
    assert.match(after.json().error.message, /only by correction/);
  });

  it('lets a head of department verify, and not a teacher', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    await post(`/v1/assessments/${id}/submit`, c.teacher.token, { version: await versionOf(id, c.token) });

    assert.equal((await post(`/v1/assessments/${id}/verify`, c.teacher.token, {
      version: await versionOf(id, c.token),
    })).statusCode, 403);

    const verified = await post(`/v1/assessments/${id}/verify`, c.hod.token, {
      version: await versionOf(id, c.token),
    });
    assert.equal(verified.statusCode, 200);
    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    assert.equal(sheet.component.status, 'verified');
    assert.equal(sheet.component.verified_by, 'Rajan Iyer');

    const again = await post(`/v1/assessments/${id}/verify`, c.hod.token, {
      version: sheet.component.version,
    });
    assert.equal(again.statusCode, 409, 'verified is terminal');
  });

  it('refuses to verify a sheet that was never submitted', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    const refused = await post(`/v1/assessments/${id}/verify`, c.hod.token, {
      version: await versionOf(id, c.token),
    });
    assert.equal(refused.statusCode, 409);
  });

  it('the database refuses a return to draft, because there is no unlock', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    await post(`/v1/assessments/${id}/submit`, c.teacher.token, { version: await versionOf(id, c.token) });

    const { createPool } = await import('../src/infrastructure/db/pool.ts');
    const { MIGRATOR_URL } = await import('./helpers.ts');
    const pool = createPool(MIGRATOR_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE assessment_components SET status = 'draft' WHERE id = $1`, [id]),
        /cannot go from submitted to draft/,
      );
    } finally {
      await pool.end();
    }
  });

  it('puts submitted sheets in the head of department\'s queue, and not a teacher\'s', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    await post(`/v1/assessments/${id}/submit`, c.teacher.token, { version: await versionOf(id, c.token) });

    const queue = (await get('/v1/assessments', c.hod.token)).json().data;
    assert.deepEqual(queue.map((x: any) => x.id), [id]);
    assert.equal((await get('/v1/assessments', c.teacher.token)).statusCode, 403);
  });
});

describe('a submitted mark changes only by correction', () => {
  async function submitted(code = 'assess-college') {
    const c = await oneCourse(code);
    const id = await markedSheet(c);
    await post(`/v1/assessments/${id}/submit`, c.teacher.token, { version: await versionOf(id, c.token) });
    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    const ravi = sheet.students.find((x: any) => x.enrolment_number === 'CSE2026-002');
    return { ...c, id, markId: ravi.mark_id as string };
  }

  it('lets a head of department correct with a reason, and records from and to', async () => {
    const c = await submitted();
    const corrected = await post(`/v1/assessment-marks/${c.markId}/correct`, c.hod.token, {
      status: 'scored', score: 31, reason: 'Sat the test late with permission',
    });
    assert.equal(corrected.statusCode, 200);
    assert.deepEqual(corrected.json().data, {
      from: { status: 'absent', score: null }, to: { status: 'scored', score: 31 },
    });

    const sheet = (await get(`/v1/assessments/${c.id}/sheet`, c.token)).json().data;
    const ravi = sheet.students.find((x: any) => x.enrolment_number === 'CSE2026-002');
    assert.equal(ravi.status, 'scored');
    assert.equal(ravi.score, 31);
    assert.equal(sheet.corrections.length, 1);
    assert.equal(sheet.corrections[0].from_status, 'absent');
    assert.equal(sheet.corrections[0].to_score, 31);
    assert.equal(sheet.corrections[0].corrected_by, 'Rajan Iyer');
  });

  it('does not let a teacher correct their own submitted sheet', async () => {
    const c = await submitted();
    const refused = await post(`/v1/assessment-marks/${c.markId}/correct`, c.teacher.token, {
      status: 'scored', score: 31, reason: 'I made a mistake',
    });
    assert.equal(refused.statusCode, 403);
  });

  it('requires a reason, and refuses a score above the maximum', async () => {
    const c = await submitted();
    assert.equal((await post(`/v1/assessment-marks/${c.markId}/correct`, c.hod.token, {
      status: 'scored', score: 31, reason: '',
    })).statusCode, 422);
    const over = await post(`/v1/assessment-marks/${c.markId}/correct`, c.hod.token, {
      status: 'scored', score: 60, reason: 'Typo',
    });
    assert.equal(over.statusCode, 422);
    assert.match(over.json().error.message, /60 is more than the 50/);
  });

  it('refuses a correction on a draft sheet, which can simply be changed', async () => {
    const c = await oneCourse();
    const id = await markedSheet(c);
    const sheet = (await get(`/v1/assessments/${id}/sheet`, c.token)).json().data;
    const refused = await post(`/v1/assessment-marks/${sheet.students[0].mark_id}/correct`, c.hod.token, {
      status: 'scored', score: 45, reason: 'Unnecessary paperwork',
    });
    assert.equal(refused.statusCode, 409);
    assert.match(refused.json().error.message, /has not been submitted yet/);
  });

  it('the corrections log cannot be rewritten by the application at all', async () => {
    const c = await submitted();
    await post(`/v1/assessment-marks/${c.markId}/correct`, c.hod.token, {
      status: 'exempt', reason: 'Medical certificate arrived later',
    });
    const { createPool } = await import('../src/infrastructure/db/pool.ts');
    const { APP_URL } = await import('./helpers.ts');
    const pool = createPool(APP_URL);
    try {
      await assert.rejects(pool.query(`UPDATE assessment_mark_corrections SET reason = 'x'`), /permission denied/i);
      await assert.rejects(pool.query(`DELETE FROM assessment_mark_corrections`), /permission denied/i);
    } finally {
      await pool.end();
    }
  });
});

describe('a teacher records marks only for courses they teach', () => {
  it('cannot mark a course they are not assigned to', async () => {
    const c = await oneCourse();
    const other = await c.course('CS302', 'Databases', c.section);
    const otherTeacher = await c.person('Ravi Shankar', 'rs@assess-college.edu', 'faculty', 'section', c.section);
    await post(`/v1/offerings/${other}/instructors`, c.token, { person_id: otherTeacher.personId, role: 'lead' });
    await post(`/v1/offerings/${other}/enrolments/cohort`, c.token, { from: '2026-06-01' });
    const id = (await post(`/v1/offerings/${other}/assessments`, c.token, {
      name: 'Test 1', max_marks: 50, weight: 20,
    })).json().data.id;

    const refused = await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    assert.equal(refused.statusCode, 403);
    assert.match(refused.json().error.message, /not assigned to teach this course/);
  });

  it('cannot mark a cohort their role does not reach, even if assigned', async () => {
    const c = await oneCourse();
    const sectionB = await c.cohort('B');
    const courseB = await c.course('CS303', 'Compilers', sectionB);
    await post(`/v1/offerings/${courseB}/instructors`, c.token, { person_id: c.teacher.personId, role: 'lead' });
    const id = (await post(`/v1/offerings/${courseB}/assessments`, c.token, {
      name: 'Test 1', max_marks: 50, weight: 20,
    })).json().data.id;

    const refused = await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    assert.equal(refused.statusCode, 403, 'scope and reach are both required');
  });

  it('stops when the instructor assignment ends', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    const offering = (await get(`/v1/offerings?section_id=${c.section}`, c.token)).json().data[0];
    await post(`/v1/instructor-assignments/${offering.instructors[0].assignment_id}/end`, c.token, {
      reason: 'Handed over mid-term',
    });
    const refused = await post(`/v1/assessments/${id}/held-on`, c.teacher.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    assert.equal(refused.statusCode, 403);
  });

  it('lists a teacher\'s own components and nobody else\'s, however it is asked', async () => {
    const c = await oneCourse();
    const mine = await plan(c);
    const other = await c.course('CS302', 'Databases', c.section);
    await post(`/v1/offerings/${other}/assessments`, c.token, { name: 'Test 1', max_marks: 50, weight: 20 });

    for (const query of ['', `?offering_id=${other}`, '?mine_person_id=anyone']) {
      const feed = (await get(`/v1/me/assessments${query}`, c.teacher.token)).json().data;
      assert.deepEqual(feed.map((x: any) => x.id), [mine], `widened by "${query}"`);
    }
  });

  it('lets an administrator enter a sheet for a teacher who cannot', async () => {
    const c = await oneCourse();
    const id = await plan(c);
    // Institution-wide authority is what makes this an administrative act.
    const set = await post(`/v1/assessments/${id}/held-on`, c.token, {
      version: await versionOf(id, c.token), held_on: '2026-06-10',
    });
    assert.equal(set.statusCode, 200);
  });
});

describe('tenant isolation holds for assessment', () => {
  it('one college cannot read or mark another college sheet', async () => {
    const a = await oneCourse('assess-a');
    const b = await oneCourse('assess-b');
    const id = await plan(a);
    assert.equal((await get(`/v1/assessments/${id}/sheet`, b.token)).statusCode, 404);
    assert.equal((await put(`/v1/assessments/${id}/marks`, b.token, {
      version: 1, marks: [{ student_id: a.nisha.id, status: 'scored', score: 10 }],
    })).statusCode, 404);
  });
});

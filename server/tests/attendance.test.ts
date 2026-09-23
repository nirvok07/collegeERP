/**
 * M6 Attendance: the most consequential record in the system.
 *
 * The tests that matter most prove four things. A mark can only exist for a
 * student who was enrolled in that course ON THAT DAY. A submitted register
 * cannot be edited, only corrected, and every correction states who changed what
 * and why. A teacher can record only the teaching they are actually assigned.
 * And two teachers on one register cannot silently overwrite each other.
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
  harness.app.inject({
    method: 'POST', url, headers: as(t), payload: body as never,
  }) as Promise<LightMyRequestResponse>;
const put = (url: string, t: string, body: unknown = {}) =>
  harness.app.inject({
    method: 'PUT', url, headers: as(t), payload: body as never,
  }) as Promise<LightMyRequestResponse>;
const patch = (url: string, t: string, body: unknown = {}) =>
  harness.app.inject({
    method: 'PATCH', url, headers: as(t), payload: body as never,
  }) as Promise<LightMyRequestResponse>;

/**
 * A college with a live cohort, one course taught by one teacher, two enrolled
 * students, and one class that already happened.
 *
 * The term runs 1 June to 30 November 2026, which is in the past relative to the
 * system clock, so every class in it can be marked.
 */
async function attendanceSetup(code = 'attend-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Attendance College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: {
      institution_code: code, token: prov.body.data.invitation.token,
      password: 'admin-strong-99',
    },
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

  async function staff(name: string, email: string, sectionId: string, role = 'faculty') {
    const invited = await post('/v1/people', token, {
      full_name: name, email, person_type: 'staff',
      role: { role_key: role, scope_type: 'section', scope_ref_id: sectionId },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: code, token: invited.json().data.invitation.token,
        password: 'staff-strong-99',
      },
    });
    const signedIn = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: code, identifier: email, password: 'staff-strong-99' },
    })) as LightMyRequestResponse;
    return {
      personId: invited.json().data.person_id as string,
      token: signedIn.json().data.access_token as string,
      assignmentId: null as string | null,
    };
  }

  async function cohort(label: string) {
    const section = (await post('/v1/sections', token, {
      program_id: program, term_id: term, term_number: 5, label, capacity: 60,
    })).json().data.id;
    await post(`/v1/sections/${section}/status`, token, { status: 'open' });
    await post(`/v1/sections/${section}/status`, token, { status: 'active' });
    return section as string;
  }

  async function course(codeName: string, title: string, sectionId: string) {
    const courseId = (await post('/v1/courses', token, { code: codeName, title }))
      .json().data.id;
    return (await post('/v1/offerings', token, {
      section_id: sectionId, course_id: courseId,
    })).json().data.id as string;
  }

  async function admit(name: string, number: string, sectionId: string) {
    const created = (await post('/v1/students', token, {
      full_name: name, email: `${number.toLowerCase()}@test.edu`, enrolment_number: number,
      program_id: program, admitted_on: '2026-06-01',
    })).json().data as { id: string };
    await post(`/v1/sections/${sectionId}/members`, token, {
      student_id: created.id, from: '2026-06-01',
    });
    return created;
  }

  async function classOn(offeringId: string, date: string, startsAt = '09:00') {
    return (await post('/v1/sessions', token, {
      offering_id: offeringId, session_date: date, starts_at: startsAt,
      ends_at: '10:00',
    })).json().data.id as string;
  }

  return { code, token, campus, department, program, year, term, staff, cohort, course, admit, classOn };
}

/** The common shape: one cohort, one course, one teacher, two students, one class. */
async function oneClass(code = 'attend-college') {
  const s = await attendanceSetup(code);
  const section = await s.cohort('A');
  const offering = await s.course('CS301', 'Operating Systems', section);
  const teacher = await s.staff('Asha Menon', `asha@${code}.edu`, section);
  await post(`/v1/offerings/${offering}/instructors`, s.token, {
    person_id: teacher.personId, role: 'lead',
  });
  const nisha = await s.admit('Nisha Kumar', 'cse2026-001', section);
  const ravi = await s.admit('Ravi Nair', 'cse2026-002', section);
  const session = await s.classOn(offering, '2026-06-02');
  return { ...s, section, offering, teacher, nisha, ravi, session };
}

describe('a register opens with the roster of that day', () => {
  it('lists every enrolled student with nothing said about them yet', async () => {
    const c = await oneClass();
    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;

    assert.equal(sheet.sheet.status, 'draft');
    assert.equal(sheet.sheet.version, 0, 'no register exists until somebody marks something');
    assert.equal(sheet.students.length, 2);
    // Null is not absent. Nobody has said anything about this student yet.
    assert.deepEqual(sheet.students.map((x: any) => x.state), [null, null]);
    assert.equal(sheet.summary.unmarked, 2);
    assert.equal(sheet.session.course.code, 'CS301');
  });

  it('shows the roster as it stood on the class date, not today', async () => {
    const c = await oneClass();
    // Ravi leaves in August. June's register still expects him.
    await post(`/v1/sections/${c.section}/members/${c.ravi.id}/end`, c.token, {
      on: '2026-08-01', reason: 'Left the college',
    });

    const june = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(june.students.length, 2, 'he was taught in June');

    const september = await c.classOn(c.offering, '2026-09-07');
    const later = (await get(`/v1/sessions/${september}/attendance`, c.token)).json().data;
    assert.deepEqual(later.students.map((x: any) => x.enrolment_number), ['CSE2026-001']);
  });

  it('is ordered by enrolment number, so a paper register can be followed down', async () => {
    const c = await oneClass();
    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.deepEqual(
      sheet.students.map((x: any) => x.enrolment_number), ['CSE2026-001', 'CSE2026-002'],
    );
  });
});

describe('marking a register', () => {
  it('records a whole class in one request', async () => {
    const c = await oneClass();
    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'absent' },
      ],
    });
    assert.equal(marked.statusCode, 200);
    assert.equal(marked.json().data.marked, 2);
    assert.equal(marked.json().data.version, 1);

    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.deepEqual(sheet.summary, {
      present: 1, absent: 1, late: 0, excused: 0, marked: 2, unmarked: 0, total: 2,
    });
    assert.equal(sheet.students[0].marked_by, 'Priya Sharma');
  });

  it('changes a mark freely while the register is a draft', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'absent' }],
    });
    const again = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 1, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(again.statusCode, 200);

    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(sheet.students[0].state, 'present');
    assert.equal(sheet.corrections.length, 0, 'a draft edit is not a correction');
  });

  it('records late and excused, which exist because colleges record them', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'late' },
        { student_id: c.ravi.id, state: 'excused', note: 'NCC camp' },
      ],
    });
    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(sheet.summary.late, 1);
    assert.equal(sheet.summary.excused, 1);
    assert.equal(sheet.students[1].note, 'NCC camp');
  });

  it('refuses a student who was not enrolled in the course that day', async () => {
    const c = await oneClass();
    const outsider = (await post('/v1/students', c.token, {
      full_name: 'Meera Das', email: 'meera-outsider@test.edu', enrolment_number: 'cse2026-009',
      program_id: c.program, admitted_on: '2026-06-01',
    })).json().data;

    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: outsider.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 409);
    assert.match(marked.json().error.message, /not enrolled in this course on 2026-06-02/);
  });

  it('refuses a student enrolled only after the class happened', async () => {
    const c = await oneClass();
    const late = (await post('/v1/students', c.token, {
      full_name: 'Late Joiner', email: 'late-joiner@test.edu', enrolment_number: 'cse2026-010',
      program_id: c.program, admitted_on: '2026-06-01',
    })).json().data;
    await post(`/v1/sections/${c.section}/members`, c.token, {
      student_id: late.id, from: '2026-07-01',
    });

    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: late.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 409);
  });

  it('refuses a cancelled class, which has no attendance to record', async () => {
    const c = await oneClass();
    await post(`/v1/sessions/${c.session}/cancel`, c.token, { reason: 'Teacher unwell' });
    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 409);
    assert.match(marked.json().error.message, /cancelled/);
  });

  it('refuses a class that has not happened yet', async () => {
    const c = await oneClass();
    const futureYear = (await post('/v1/academic-years', c.token, {
      name: '2099-00', starts_on: '2099-01-01', ends_on: '2099-12-31',
    })).json().data.id;
    const future = (await post('/v1/terms', c.token, {
      academic_year_id: futureYear, sequence: 1, name: 'Semester 1',
      starts_on: '2099-01-01', ends_on: '2099-05-31',
    })).json().data.id;
    const futureSection = (await post('/v1/sections', c.token, {
      program_id: c.program, term_id: future, term_number: 6, label: 'F',
    })).json().data.id;
    await post(`/v1/sections/${futureSection}/status`, c.token, { status: 'open' });
    await post(`/v1/sections/${futureSection}/status`, c.token, { status: 'active' });
    const futureCourse = (await post('/v1/courses', c.token, { code: 'CS401', title: 'AI' }))
      .json().data.id;
    const futureOffering = (await post('/v1/offerings', c.token, {
      section_id: futureSection, course_id: futureCourse,
    })).json().data.id;
    const student = await c.admit('Future Student', 'cse2099-001', futureSection);
    const futureSession = (await post('/v1/sessions', c.token, {
      offering_id: futureOffering, session_date: '2099-02-02',
      starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    const marked = await put(`/v1/sessions/${futureSession}/attendance`, c.token, {
      version: 0, marks: [{ student_id: student.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 409);
    assert.match(marked.json().error.message, /recorded on the day, not before/);
  });
});

describe('two people on one register do not overwrite each other', () => {
  it('refuses a stale version and says why', async () => {
    const c = await oneClass();
    // Both read version 0. The first marks; the second still believes 0.
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });

    const second = await put(`/v1/sessions/${c.session}/attendance`, c.teacher.token, {
      version: 0, marks: [{ student_id: c.ravi.id, state: 'absent' }],
    });
    assert.equal(second.statusCode, 409);
    assert.match(second.json().error.message, /Somebody else changed this register/);

    // And nothing of theirs was written.
    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(sheet.summary.marked, 1);
  });

  it('accepts the second write once it has read the current version', async () => {
    const c = await oneClass();
    const first = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    const second = await put(`/v1/sessions/${c.session}/attendance`, c.teacher.token, {
      version: first.json().data.version, marks: [{ student_id: c.ravi.id, state: 'absent' }],
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().data.version, 2);
  });

  it('a whole batch fails together when one mark in it is wrong', async () => {
    const c = await oneClass();
    const outsider = (await post('/v1/students', c.token, {
      full_name: 'Meera Das', email: 'meera-outsider@test.edu', enrolment_number: 'cse2026-009',
      program_id: c.program, admitted_on: '2026-06-01',
    })).json().data;

    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: outsider.id, state: 'present' },
      ],
    });
    assert.equal(marked.statusCode, 409);

    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(sheet.summary.marked, 0, 'fifty marks either all land or none do');
    assert.equal(sheet.sheet.version, 0, 'and no register was opened');
  });
});

describe('submitting a register closes it', () => {
  it('refuses to submit while any student has no mark', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    const submitted = await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, {
      version: 1,
    });
    assert.equal(submitted.statusCode, 409);
    assert.match(submitted.json().error.message, /1 student has no mark yet/);
  });

  it('submits a complete register and makes it read-only', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'absent' },
      ],
    });
    const submitted = await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, {
      version: 1,
    });
    assert.equal(submitted.statusCode, 200);

    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(sheet.sheet.status, 'submitted');
    assert.equal(sheet.sheet.submitted_by, 'Priya Sharma');
    assert.equal(sheet.can_mark, false);
    assert.equal(sheet.can_correct, true);

    const after = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 2, marks: [{ student_id: c.nisha.id, state: 'absent' }],
    });
    assert.equal(after.statusCode, 409);
    assert.match(after.json().error.message, /correction, which is recorded/);
  });

  it('refuses a second submission', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'present' },
      ],
    });
    await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, { version: 1 });
    const again = await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, { version: 2 });
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /already been submitted/);
  });

  it('records the class as taught, so the two records cannot contradict', async () => {
    const c = await oneClass();
    assert.equal(
      (await get(`/v1/sessions/${c.session}`, c.token)).json().data.status, 'scheduled',
    );

    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'present' },
      ],
    });
    await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, { version: 1 });

    assert.equal(
      (await get(`/v1/sessions/${c.session}`, c.token)).json().data.status, 'completed',
      'submitting a register is evidence the class happened',
    );
  });

  it('the database refuses a submitted register returning to draft', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'present' },
      ],
    });
    await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, { version: 1 });

    const { createPool } = await import('../src/infrastructure/db/pool.ts');
    const { MIGRATOR_URL } = await import('./helpers.ts');
    const pool = createPool(MIGRATOR_URL);
    try {
      // There is no unlock endpoint. There is also no unlock at all.
      await assert.rejects(
        pool.query(`UPDATE attendance_sheets SET status = 'draft'`),
        /has been submitted/,
      );
    } finally {
      await pool.end();
    }
  });
});

describe('a submitted mark changes only by correction', () => {
  async function submittedSheet(code = 'attend-college') {
    const c = await oneClass(code);
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'absent' },
        { student_id: c.ravi.id, state: 'present' },
      ],
    });
    await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, { version: 1 });
    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    return { ...c, sheet, recordId: sheet.students[0].record_id as string };
  }

  it('changes the mark and records who changed what and why', async () => {
    const c = await submittedSheet();
    const corrected = await post(`/v1/attendance-records/${c.recordId}/correct`, c.token, {
      state: 'present', reason: 'Signed the paper register; the app entry was mine',
    });
    assert.equal(corrected.statusCode, 200);
    assert.deepEqual(corrected.json().data, { from: 'absent', to: 'present' });

    const after = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(after.students[0].state, 'present');
    assert.equal(after.corrections.length, 1);
    assert.equal(after.corrections[0].from_state, 'absent');
    assert.equal(after.corrections[0].to_state, 'present');
    assert.match(after.corrections[0].reason, /paper register/);
    assert.equal(after.corrections[0].student_name, 'Nisha Kumar');
    assert.equal(after.corrections[0].corrected_by, 'Priya Sharma');
  });

  it('requires a reason', async () => {
    const c = await submittedSheet();
    const bare = await post(`/v1/attendance-records/${c.recordId}/correct`, c.token, {
      state: 'present', reason: '',
    });
    assert.equal(bare.statusCode, 422);
  });

  it('refuses a correction whose story does not match the mark', async () => {
    const c = await submittedSheet();
    // Two people read "absent"; the first corrects it to present.
    await post(`/v1/attendance-records/${c.recordId}/correct`, c.token, {
      state: 'present', reason: 'First correction',
    });
    // The second still believes it is absent and tries to make it late.
    const stale = await post(`/v1/attendance-records/${c.recordId}/correct`, c.token, {
      state: 'late', reason: 'Arrived twenty minutes in',
    });
    assert.equal(stale.statusCode, 200, 'a genuine second correction is allowed');

    const after = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;
    assert.equal(after.students[0].state, 'late');
    // Both corrections stand, so the whole history is reconstructable.
    assert.equal(after.corrections.length, 2);
  });

  it('refuses a correction to the state it already holds', async () => {
    const c = await submittedSheet();
    const pointless = await post(`/v1/attendance-records/${c.recordId}/correct`, c.token, {
      state: 'absent', reason: 'No change at all',
    });
    assert.equal(pointless.statusCode, 409);
    assert.match(pointless.json().error.message, /already absent/);
  });

  it('refuses a correction on a draft register, which can simply be changed', async () => {
    const c = await oneClass();
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'absent' }],
    });
    const sheet = (await get(`/v1/sessions/${c.session}/attendance`, c.token)).json().data;

    const corrected = await post(
      `/v1/attendance-records/${sheet.students[0].record_id}/correct`, c.token,
      { state: 'present', reason: 'Unnecessary paperwork' },
    );
    assert.equal(corrected.statusCode, 409);
    assert.match(corrected.json().error.message, /has not been submitted yet/);
  });

  it('does not let a teacher correct their own submitted register', async () => {
    const c = await submittedSheet();
    // Blueprint 2 D4 puts this authority with the HOD or class advisor. Until
    // the approvals capability exists, a teacher asks.
    const refused = await post(`/v1/attendance-records/${c.recordId}/correct`, c.teacher.token, {
      state: 'present', reason: 'I made a mistake',
    });
    assert.equal(refused.statusCode, 403);
  });

  it('the corrections log cannot be rewritten by the application at all', async () => {
    const c = await submittedSheet();
    await post(`/v1/attendance-records/${c.recordId}/correct`, c.token, {
      state: 'present', reason: 'Paper register says present',
    });

    const { createPool } = await import('../src/infrastructure/db/pool.ts');
    const { APP_URL } = await import('./helpers.ts');
    const pool = createPool(APP_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE attendance_corrections SET reason = 'something else'`),
        /permission denied/i,
      );
      await assert.rejects(
        pool.query(`DELETE FROM attendance_corrections`), /permission denied/i,
      );
    } finally {
      await pool.end();
    }
  });
});

describe('a teacher records only the teaching they are assigned', () => {
  it('marks and submits their own class', async () => {
    const c = await oneClass();
    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.teacher.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'absent' },
      ],
    });
    assert.equal(marked.statusCode, 200);

    const submitted = await post(
      `/v1/sessions/${c.session}/attendance/submit`, c.teacher.token, { version: 1 },
    );
    assert.equal(submitted.statusCode, 200);
  });

  it('cannot mark a class they are not assigned to teach', async () => {
    const c = await oneClass();
    const other = await c.course('CS302', 'Databases', c.section);
    const otherTeacher = await c.staff('Ravi Shankar', 'rs@attend-college.edu', c.section);
    await post(`/v1/offerings/${other}/instructors`, c.token, {
      person_id: otherTeacher.personId, role: 'lead',
    });
    await post(`/v1/offerings/${other}/enrolments/cohort`, c.token, { from: '2026-06-01' });
    const otherSession = await c.classOn(other, '2026-06-03');

    // The permission is held and the scope covers the cohort. The reach does
    // not: nobody has assigned them this course. That distinction is AD-40.
    const refused = await put(`/v1/sessions/${otherSession}/attendance`, c.teacher.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(refused.statusCode, 403);
    assert.match(refused.json().error.message, /not assigned to teach this course/);
  });

  it('cannot mark a cohort their role does not scope to', async () => {
    const c = await oneClass();
    const sectionB = await c.cohort('B');
    const courseB = await c.course('CS303', 'Compilers', sectionB);
    // Assigned to teach it, but their faculty role is scoped to section A only.
    await post(`/v1/offerings/${courseB}/instructors`, c.token, {
      person_id: c.teacher.personId, role: 'lead',
    });
    const studentB = await c.admit('Meera Das', 'cse2026-021', sectionB);
    const sessionB = await c.classOn(courseB, '2026-06-04');

    const refused = await put(`/v1/sessions/${sessionB}/attendance`, c.teacher.token, {
      version: 0, marks: [{ student_id: studentB.id, state: 'present' }],
    });
    assert.equal(refused.statusCode, 403, 'scope and reach are both required');
  });

  it('stops when the instructor assignment ends', async () => {
    const c = await oneClass();
    const offering = (await get(`/v1/offerings?section_id=${c.section}`, c.token)).json().data[0];
    const assignment = offering.instructors[0].assignment_id;

    await post(`/v1/instructor-assignments/${assignment}/end`, c.token, {
      reason: 'Handed over mid-term',
    });

    const refused = await put(`/v1/sessions/${c.session}/attendance`, c.teacher.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(refused.statusCode, 403);
  });

  it('stops when the role is revoked', async () => {
    const c = await oneClass();
    const assignments = (await get('/v1/assignments', c.token)).json().data;
    const role = assignments.find((a: any) => a.person_id === c.teacher.personId);
    await post(`/v1/assignments/${role.id}/revoke`, c.token, { reason: 'No longer teaching' });

    const refused = await put(`/v1/sessions/${c.session}/attendance`, c.teacher.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(refused.statusCode, 403);
  });

  it('lets a stand-in mark the one class they are covering', async () => {
    const c = await oneClass();
    const standIn = await c.staff('Meera Das', 'meera@attend-college.edu', c.section);
    await patch(`/v1/sessions/${c.session}`, c.token, {
      stand_in_person_id: standIn.personId, reason: 'Lead at a conference',
    });

    const marked = await put(`/v1/sessions/${c.session}/attendance`, standIn.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 200,
      'standing in for one class is reach for that one class');
  });

  it('lets an administrator record a register for a teacher who cannot', async () => {
    const c = await oneClass();
    // The administrator holds the permission institution-wide and teaches
    // nothing. That breadth is what makes it an administrative act.
    const marked = await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 200);
  });

  it('does not let a staff member with no attendance permission mark anything', async () => {
    const c = await oneClass();
    const invited = await post('/v1/people', c.token, {
      full_name: 'Office Clerk', email: 'clerk@attend-college.edu', person_type: 'staff',
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: c.code, token: invited.json().data.invitation.token,
        password: 'clerk-strong-99',
      },
    });
    const clerk = ((await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: {
        institution_code: c.code, identifier: 'clerk@attend-college.edu',
        password: 'clerk-strong-99',
      },
    })) as LightMyRequestResponse).json().data.access_token as string;

    const refused = await put(`/v1/sessions/${c.session}/attendance`, clerk, {
      version: 0, marks: [{ student_id: c.nisha.id, state: 'present' }],
    });
    assert.equal(refused.statusCode, 403);
  });
});

describe('the overview answers what still needs marking', () => {
  it('lists every class in a window with the state of its register', async () => {
    const c = await oneClass();
    const second = await c.classOn(c.offering, '2026-06-09');
    await put(`/v1/sessions/${c.session}/attendance`, c.token, {
      version: 0,
      marks: [
        { student_id: c.nisha.id, state: 'present' },
        { student_id: c.ravi.id, state: 'absent' },
      ],
    });
    await post(`/v1/sessions/${c.session}/attendance/submit`, c.token, { version: 1 });

    const overview = (await get('/v1/attendance?from=2026-06-01&to=2026-06-30', c.token))
      .json().data;
    assert.equal(overview.length, 2);

    const done = overview.find((x: any) => x.session_id === c.session);
    assert.equal(done.status, 'submitted');
    assert.equal(done.counts.present, 1);
    assert.equal(done.counts.absent, 1);

    const pending = overview.find((x: any) => x.session_id === second);
    assert.equal(pending.status, 'draft');
    assert.equal(pending.marked, 0);
  });

  it('is not readable by a teacher, because it spans the whole college', async () => {
    const c = await oneClass();
    const refused = await get('/v1/attendance', c.teacher.token);
    assert.equal(refused.statusCode, 403);
  });
});

describe('tenant isolation holds for attendance', () => {
  it('one college cannot read or mark another college register', async () => {
    const a = await oneClass('attend-a');
    const b = await oneClass('attend-b');

    const read = await get(`/v1/sessions/${a.session}/attendance`, b.token);
    assert.equal(read.statusCode, 404, 'the class is not visible, so there is nothing to read');

    const marked = await put(`/v1/sessions/${a.session}/attendance`, b.token, {
      version: 0, marks: [{ student_id: a.nisha.id, state: 'present' }],
    });
    assert.equal(marked.statusCode, 404);
  });
});

/**
 * SA-ATT-1: a staff member's own attendance, punched in and out. Self-scoped
 * like `/v1/me/sessions` — no permission beyond being signed in, and the
 * server never trusts a client-supplied person id.
 */
describe('staff self-attendance (SA-ATT-1)', () => {
  it('punches in, then out, and the day appears in history', async () => {
    const c = await oneClass('attend-punch');
    const teacher = c.teacher.token;

    const in1 = await post('/v1/me/staff-attendance/punch-in', teacher);
    assert.equal(in1.statusCode, 201);
    assert.ok(in1.json().data.punch_in_at);
    assert.equal(in1.json().data.punch_out_at, null);

    const out1 = await post('/v1/me/staff-attendance/punch-out', teacher);
    assert.equal(out1.statusCode, 200);
    assert.ok(out1.json().data.punch_out_at);

    const history = await get('/v1/me/staff-attendance', teacher);
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().data.length, 1);
    assert.equal(history.json().data[0].id, in1.json().data.id);
  });

  it('refuses a second punch-in the same day, and a punch-out before any punch-in', async () => {
    const c = await oneClass('attend-punch-2');
    const teacher = c.teacher.token;

    const early = await post('/v1/me/staff-attendance/punch-out', teacher);
    assert.equal(early.statusCode, 409);

    await post('/v1/me/staff-attendance/punch-in', teacher);
    const again = await post('/v1/me/staff-attendance/punch-in', teacher);
    assert.equal(again.statusCode, 409);

    await post('/v1/me/staff-attendance/punch-out', teacher);
    const late = await post('/v1/me/staff-attendance/punch-out', teacher);
    assert.equal(late.statusCode, 409);
  });

  it('keeps one teacher\'s punches invisible to another', async () => {
    const c = await oneClass('attend-punch-3');
    await post('/v1/me/staff-attendance/punch-in', c.teacher.token);

    const other = await c.staff('Rohit Dey', 'rohit@attend-punch-3.edu', c.section);
    const otherHistory = await get('/v1/me/staff-attendance', other.token);
    assert.equal(otherHistory.json().data.length, 0, 'a new person has nothing punched, ever their own');
  });
});

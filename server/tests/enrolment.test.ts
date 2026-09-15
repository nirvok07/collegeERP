/**
 * M5 Student Records, the minimum an attendance roster needs.
 *
 * The tests that matter most prove three things: a student record never
 * duplicates identity, placing a student in a cohort enrols them in what that
 * cohort is taught, and the roster of a course is answered AS OF A DATE, so a
 * withdrawal in week ten cannot rewrite who was expected in week three.
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
const patch = (url: string, t: string, body: unknown = {}) =>
  harness.app.inject({
    method: 'PATCH', url, headers: as(t), payload: body as never,
  }) as Promise<LightMyRequestResponse>;

/** A college with a live cohort and two courses taught to it. */
async function enrolmentSetup(code = 'enrol-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Enrolment College', adminEmail: `admin@${code}.edu`,
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
  const section = (await post('/v1/sections', token, {
    program_id: program, term_id: term, term_number: 5, label: 'A', capacity: 60,
  })).json().data.id;
  await post(`/v1/sections/${section}/status`, token, { status: 'open' });
  await post(`/v1/sections/${section}/status`, token, { status: 'active' });

  async function offering(courseCode: string, title: string) {
    const course = (await post('/v1/courses', token, { code: courseCode, title }))
      .json().data.id;
    return (await post('/v1/offerings', token, { section_id: section, course_id: course }))
      .json().data.id as string;
  }

  async function admit(name: string, number: string) {
    const created = await post('/v1/students', token, {
      full_name: name, email: `${number.toLowerCase()}@test.edu`, enrolment_number: number,
      program_id: program, admitted_on: '2026-06-01',
    });
    return created.json().data as { id: string; person_id: string };
  }

  return { code, token, campus, department, program, year, term, section, offering, admit };
}

describe('a student record keys history without duplicating identity', () => {
  it('admits a student as a person and a record in one step', async () => {
    const s = await enrolmentSetup();
    const admitted = await post('/v1/students', s.token, {
      full_name: 'Nisha Kumar', email: 'NISHA@enrol.edu',
      enrolment_number: 'cse2026-001', program_id: s.program, admitted_on: '2026-06-01',
    });
    assert.equal(admitted.statusCode, 201);

    const students = (await get('/v1/students', s.token)).json().data;
    assert.equal(students.length, 1);
    assert.equal(students[0].full_name, 'Nisha Kumar');
    assert.equal(students[0].enrolment_number, 'CSE2026-001', 'normalised at the boundary');
    assert.equal(students[0].email, 'nisha@enrol.edu', 'email lowercased as M1 requires');
    assert.equal(students[0].status, 'enrolled');
    assert.equal(students[0].section, null, 'unplaced is a normal state, not an error');
  });

  it('the student appears in the people directory as one person, not two', async () => {
    const s = await enrolmentSetup();
    await s.admit('Nisha Kumar', 'cse2026-001');
    const people = (await get('/v1/people?type=student', s.token)).json().data;
    assert.equal(people.length, 1);
    assert.equal(people[0].person_type, 'student');
  });

  it('refuses a duplicate enrolment number', async () => {
    const s = await enrolmentSetup();
    await s.admit('Nisha Kumar', 'cse2026-001');
    const again = await post('/v1/students', s.token, {
      full_name: 'Someone Else', email: 'someone-else@enrol.edu', enrolment_number: 'CSE2026-001',
      program_id: s.program, admitted_on: '2026-06-01',
    });
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /already in use/);
  });

  it('the database refuses a student record over a staff person', async () => {
    const s = await enrolmentSetup();
    const staff = await post('/v1/people', s.token, {
      full_name: 'Asha Menon', email: 'asha@enrol.edu', person_type: 'staff',
    });
    // Through the repository, because no route offers this: the guard that
    // matters is the one no code path can go around.
    const { createPool } = await import('../src/infrastructure/db/pool.ts');
    const { MIGRATOR_URL } = await import('./helpers.ts');
    const pool = createPool(MIGRATOR_URL);
    try {
      const institution = (await pool.query(`SELECT id FROM institutions LIMIT 1`)).rows[0].id;
      await assert.rejects(
        pool.query(
          `INSERT INTO students (id, tenant_id, person_id, enrolment_number, program_id, admitted_on)
           VALUES (gen_random_uuid(), $1, $2, 'X-1', $3, '2026-06-01')`,
          [institution, staff.json().data.person_id, s.program],
        ),
        /person recorded as a student/,
      );
    } finally {
      await pool.end();
    }
  });
});

describe('placing a student in a cohort enrols them in what it is taught', () => {
  it('enrols them in every live course of the section', async () => {
    const s = await enrolmentSetup();
    const os = await s.offering('CS301', 'Operating Systems');
    const db = await s.offering('CS302', 'Databases');
    const student = await s.admit('Nisha Kumar', 'cse2026-001');

    const placed = await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-06-01',
    });
    assert.equal(placed.statusCode, 201);
    assert.equal(placed.json().data.coursesEnrolled, 2);

    for (const offering of [os, db]) {
      const roster = (await get(`/v1/offerings/${offering}/roster?on=2026-06-05`, s.token))
        .json().data;
      assert.equal(roster.students.length, 1);
      assert.equal(roster.students[0].enrolment_number, 'CSE2026-001');
    }
  });

  it('shows the cohort on the student record', async () => {
    const s = await enrolmentSetup();
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, { student_id: student.id });

    const read = (await get(`/v1/students/${student.id}`, s.token)).json().data;
    assert.equal(read.section.label, 'A');
    assert.equal(read.section.term_number, 5);
  });

  it('refuses a second cohort in the same term, naming the one they are in', async () => {
    const s = await enrolmentSetup();
    const other = (await post('/v1/sections', s.token, {
      program_id: s.program, term_id: s.term, term_number: 5, label: 'B',
    })).json().data.id;
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, { student_id: student.id });

    const second = await post(`/v1/sections/${other}/members`, s.token, {
      student_id: student.id,
    });
    assert.equal(second.statusCode, 409);
    assert.match(second.json().error.message, /already in section A/);
  });

  it('refuses to place a withdrawn student', async () => {
    const s = await enrolmentSetup();
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await patch(`/v1/students/${student.id}/status`, s.token, {
      status: 'withdrawn', reason: 'Transferred to another college',
    });
    const placed = await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id,
    });
    assert.equal(placed.statusCode, 409);
    assert.match(placed.json().error.message, /withdrawn/);
  });

  it('enrols a cohort into a course added after they arrived', async () => {
    const s = await enrolmentSetup();
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, { student_id: student.id });

    // The course arrives in week three, after everybody was placed.
    const late = await s.offering('CS303', 'Compilers');
    const roster = (await get(`/v1/offerings/${late}/roster`, s.token)).json().data;
    assert.equal(roster.students.length, 0, 'adding a course enrols nobody by itself');

    const enrolled = await post(`/v1/offerings/${late}/enrolments/cohort`, s.token, {
      from: '2026-06-15',
    });
    assert.equal(enrolled.json().data.enrolled, 1);

    const after = (await get(`/v1/offerings/${late}/roster?on=2026-06-20`, s.token)).json().data;
    assert.equal(after.students.length, 1);
    // And not before they were enrolled.
    const before = (await get(`/v1/offerings/${late}/roster?on=2026-06-10`, s.token)).json().data;
    assert.equal(before.students.length, 0);
  });

  it('does not enrol the same student twice when run again', async () => {
    const s = await enrolmentSetup();
    const offering = await s.offering('CS301', 'Operating Systems');
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, { student_id: student.id });

    const again = await post(`/v1/offerings/${offering}/enrolments/cohort`, s.token, {});
    assert.equal(again.json().data.enrolled, 0);
    assert.equal(again.json().data.alreadyThere, 1);
  });
});

describe('an elective takes only the students who chose it', () => {
  it('drops one student from one course, leaving the rest of the cohort', async () => {
    const s = await enrolmentSetup();
    const elective = await s.offering('CS391', 'Machine Learning');
    const a = await s.admit('Nisha Kumar', 'cse2026-001');
    const b = await s.admit('Ravi Nair', 'cse2026-002');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: a.id, from: '2026-06-01',
    });
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: b.id, from: '2026-06-01',
    });

    const dropped = await post(`/v1/offerings/${elective}/enrolments/${b.id}/end`, s.token, {
      on: '2026-06-10', reason: 'Chose a different elective',
    });
    assert.equal(dropped.statusCode, 200);

    const after = (await get(`/v1/offerings/${elective}/roster?on=2026-06-20`, s.token))
      .json().data;
    assert.deepEqual(after.students.map((x: any) => x.enrolment_number), ['CSE2026-001']);
  });

  it('adds one student to a course their cohort is not all taking', async () => {
    const s = await enrolmentSetup();
    const elective = await s.offering('CS391', 'Machine Learning');
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-06-01',
    });
    await post(`/v1/offerings/${elective}/enrolments/${student.id}/end`, s.token, {
      on: '2026-06-10', reason: 'Changed their mind',
    });

    const back = await post(`/v1/offerings/${elective}/enrolments`, s.token, {
      student_id: student.id, from: '2026-06-15',
    });
    assert.equal(back.statusCode, 201);
    const roster = (await get(`/v1/offerings/${elective}/roster?on=2026-06-20`, s.token))
      .json().data;
    assert.equal(roster.students.length, 1);
  });

  it('refuses to enrol somebody who is not in the cohort', async () => {
    const s = await enrolmentSetup();
    const offering = await s.offering('CS301', 'Operating Systems');
    const outsider = await s.admit('Meera Das', 'cse2026-009');

    const enrolled = await post(`/v1/offerings/${offering}/enrolments`, s.token, {
      student_id: outsider.id,
    });
    assert.equal(enrolled.statusCode, 409);
    assert.match(enrolled.json().error.message, /not in the cohort/);
  });
});

describe('a database refusal reaches the user as a sentence', () => {
  it('refuses to end an enrolment before it began, naming the date', async () => {
    const s = await enrolmentSetup();
    const offering = await s.offering('CS301', 'Operating Systems');
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-07-01',
    });

    const backwards = await post(`/v1/offerings/${offering}/enrolments/${student.id}/end`,
      s.token, { on: '2026-06-10', reason: 'Chose another elective' });

    // The check constraint refuses this too. What matters is that it arrives as
    // something an operator can act on rather than as "something went wrong".
    assert.equal(backwards.statusCode, 422);
    assert.match(backwards.json().error.message, /began on 2026-07-01/);
  });

  it('refuses to end a placement before it began', async () => {
    const s = await enrolmentSetup();
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-07-01',
    });

    const backwards = await post(`/v1/sections/${s.section}/members/${student.id}/end`,
      s.token, { on: '2026-06-10', reason: 'Moved cohort' });
    assert.equal(backwards.statusCode, 422);
    assert.match(backwards.json().error.message, /joined this cohort on 2026-07-01/);
  });
});

describe('the roster is answered as of a date, never as of now', () => {
  it('a student who left in week ten is still on week three', async () => {
    const s = await enrolmentSetup();
    const offering = await s.offering('CS301', 'Operating Systems');
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-06-01',
    });

    await post(`/v1/sections/${s.section}/members/${student.id}/end`, s.token, {
      on: '2026-08-10', reason: 'Left the college',
    });

    // This is the invariant the whole design turns on: reopening an old sheet
    // must not change who was expected in the room.
    const week3 = (await get(`/v1/offerings/${offering}/roster?on=2026-06-15`, s.token))
      .json().data;
    assert.equal(week3.students.length, 1);

    const later = (await get(`/v1/offerings/${offering}/roster?on=2026-09-01`, s.token))
      .json().data;
    assert.equal(later.students.length, 0);

    // And the day they left still counts them, because they were there for it.
    const lastDay = (await get(`/v1/offerings/${offering}/roster?on=2026-08-10`, s.token))
      .json().data;
    assert.equal(lastDay.students.length, 1);
  });

  it('a student who joined in week six is absent from week three', async () => {
    const s = await enrolmentSetup();
    const offering = await s.offering('CS301', 'Operating Systems');
    const student = await s.admit('Ravi Nair', 'cse2026-002');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-07-06',
    });

    assert.equal(
      (await get(`/v1/offerings/${offering}/roster?on=2026-06-15`, s.token))
        .json().data.students.length,
      0,
    );
    assert.equal(
      (await get(`/v1/offerings/${offering}/roster?on=2026-07-10`, s.token))
        .json().data.students.length,
      1,
    );
  });

  it('keeps dates exactly as given, with no timezone drift', async () => {
    const s = await enrolmentSetup();
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    const read = (await get(`/v1/students/${student.id}`, s.token)).json().data;
    assert.equal(read.admitted_on, '2026-06-01');

    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-06-01',
    });
    const placements = (await get(`/v1/students/${student.id}/placements`, s.token)).json().data;
    assert.equal(placements[0].valid_from, '2026-06-01');
  });

  it('withdrawing a student clears every roster from that day, and no earlier one', async () => {
    const s = await enrolmentSetup();
    const offering = await s.offering('CS301', 'Operating Systems');
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    await post(`/v1/sections/${s.section}/members`, s.token, {
      student_id: student.id, from: '2026-06-01',
    });

    const withdrawn = await patch(`/v1/students/${student.id}/status`, s.token, {
      status: 'withdrawn', reason: 'Left the college',
    });
    assert.equal(withdrawn.statusCode, 200);

    const historic = (await get(`/v1/offerings/${offering}/roster?on=2026-06-15`, s.token))
      .json().data;
    assert.equal(historic.students.length, 1, 'they were taught in June');

    const placements = (await get(`/v1/students/${student.id}/placements`, s.token)).json().data;
    assert.equal(placements[0].is_current, false);
    assert.match(placements[0].end_reason, /withdrawn/);
  });

  it('requires a reason to withdraw or pause a student', async () => {
    const s = await enrolmentSetup();
    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    const bare = await patch(`/v1/students/${student.id}/status`, s.token, {
      status: 'withdrawn',
    });
    assert.equal(bare.statusCode, 422);
  });
});

describe('authorization and isolation', () => {
  it('does not let a teacher admit, place or enrol', async () => {
    const s = await enrolmentSetup();
    const invited = await post('/v1/people', s.token, {
      full_name: 'Asha Menon', email: 'asha@enrol.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: s.section },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: s.code, token: invited.json().data.invitation.token,
        password: 'staff-strong-99',
      },
    });
    const teacher = ((await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: {
        institution_code: s.code, identifier: 'asha@enrol.edu', password: 'staff-strong-99',
      },
    })) as LightMyRequestResponse).json().data.access_token as string;

    assert.equal((await post('/v1/students', teacher, {
      full_name: 'Nobody', enrolment_number: 'X-1', program_id: s.program,
      admitted_on: '2026-06-01',
    })).statusCode, 403);

    const student = await s.admit('Nisha Kumar', 'cse2026-001');
    assert.equal((await post(`/v1/sections/${s.section}/members`, teacher, {
      student_id: student.id,
    })).statusCode, 403);

    // But faculty hold student.read at their own scope, so a roster is readable
    // to the person teaching it. Institution-wide reads are not.
    assert.equal((await get('/v1/students', teacher)).statusCode, 403);
  });

  it('one college never sees another college students', async () => {
    const a = await enrolmentSetup('enrol-a');
    const b = await enrolmentSetup('enrol-b');
    await a.admit('Nisha Kumar', 'cse2026-001');

    assert.deepEqual((await get('/v1/students', b.token)).json().data, []);
  });

  it('refuses a student whose program belongs to another college', async () => {
    const a = await enrolmentSetup('enrol-a');
    const b = await enrolmentSetup('enrol-b');
    const crossed = await post('/v1/students', b.token, {
      full_name: 'Nisha Kumar', enrolment_number: 'x-1',
      program_id: a.program, admitted_on: '2026-06-01',
    });
    // Row level security hides the other college's program, so it reads as a
    // missing reference rather than a leak.
    assert.ok([404, 409, 422].includes(crossed.statusCode), `got ${crossed.statusCode}`);
  });
});

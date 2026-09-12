/**
 * M3 slice two: CourseOffering and instructor assignment.
 *
 * The tests that matter most prove three things: an offering never touches
 * curriculum, a teacher sees only their own teaching and cannot widen that from
 * the client, and an instructor handover preserves who was teaching when.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;

before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const as = (t: string) => ({ authorization: `Bearer ${t}` });
const get = (url: string, t: string) =>
  harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t: string, body: unknown = {}) =>
  harness.app.inject({ method: 'POST', url, headers: as(t), payload: body as never }) as Promise<LightMyRequestResponse>;

/** A college with a live section, a course, and a staff member to teach it. */
async function teachingSetup(code = 'offer-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Offering College', adminEmail: `admin@${code}.edu`,
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
  const section = (await post('/v1/sections', token, {
    program_id: program, term_id: term, term_number: 5, label: 'A', capacity: 60,
  })).json().data.id;
  const course = (await post('/v1/courses', token, {
    code: 'CS301', title: 'Operating Systems',
  })).json().data.id;

  /** A staff member who can teach, and who can sign in to see it. */
  async function staff(name: string, email: string) {
    const invited = await post('/v1/people', token, {
      full_name: name, email, person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: section },
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
    };
  }

  return { code, token, campus, department, program, year, term, section, course, staff };
}

const startSection = async (t: string, section: string) => {
  await post(`/v1/sections/${section}/status`, t, { status: 'open' });
  await post(`/v1/sections/${section}/status`, t, { status: 'active' });
};

describe('an offering delivers one course to one cohort', () => {
  it('creates an offering carrying its whole teaching context', async () => {
    const s = await teachingSetup();
    const created = await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course, component: 'lecture',
    });
    assert.equal(created.statusCode, 201);

    const row = (await get('/v1/offerings', s.token)).json().data[0];
    assert.equal(row.course.code, 'CS301');
    assert.equal(row.section.label, 'A');
    assert.equal(row.section.term_number, 5);
    assert.equal(row.term.name, 'Semester 1');
    assert.equal(row.academic_year_name, '2026-27');
    assert.equal(row.department_name, 'Computer Science');
    assert.equal(row.status, 'planned');
    assert.deepEqual(row.instructors, []);
  });

  it('carries no credits and no requirement: those belong to the curriculum', async () => {
    const s = await teachingSetup();
    await post('/v1/offerings', s.token, { section_id: s.section, course_id: s.course });
    const row = (await get('/v1/offerings', s.token)).json().data[0];
    assert.ok(!('credits' in row), 'a transcript reads credits from the curriculum version');
    assert.ok(!('requirement' in row));
  });

  it('refuses the same course twice to one section in one component', async () => {
    const s = await teachingSetup();
    await post('/v1/offerings', s.token, { section_id: s.section, course_id: s.course });
    const again = await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    });
    assert.equal(again.statusCode, 409);
  });

  it('allows a lab alongside its lecture, which is how colleges staff them', async () => {
    const s = await teachingSetup();
    await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course, component: 'lecture',
    });
    const lab = await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course, component: 'lab',
    });
    assert.equal(lab.statusCode, 201);
  });

  it('refuses teaching added to a completed section', async () => {
    const s = await teachingSetup();
    await startSection(s.token, s.section);
    await post(`/v1/sections/${s.section}/status`, s.token, { status: 'completed' });

    const res = await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    });
    assert.equal(res.statusCode, 409);
  });
});

describe('offering lifecycle meets the section lifecycle', () => {
  it('an offering cannot start before its section does', async () => {
    const s = await teachingSetup();
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@offer.edu');
    await post(`/v1/offerings/${offering}/instructors`, s.token, { person_id: teacher.personId });

    const res = await post(`/v1/offerings/${offering}/status`, s.token, { status: 'active' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /not yet teaching/);
  });

  it('an offering cannot start unstaffed', async () => {
    const s = await teachingSetup();
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;

    const res = await post(`/v1/offerings/${offering}/status`, s.token, { status: 'active' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /Assign an instructor/);
  });

  it('completing a section completes its teaching, audited individually', async () => {
    const s = await teachingSetup();
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@offer.edu');
    await post(`/v1/offerings/${offering}/instructors`, s.token, { person_id: teacher.personId });
    await post(`/v1/offerings/${offering}/status`, s.token, { status: 'active' });

    const completed = await post(`/v1/sections/${s.section}/status`, s.token, { status: 'completed' });
    assert.equal(completed.statusCode, 200);

    assert.equal((await get(`/v1/offerings/${offering}`, s.token)).json().data.status, 'completed');

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT reason FROM audit_events
          WHERE action = 'offering.completed' AND subject_id = $1`, [offering],
      );
      assert.equal(rows.length, 1, 'the cascade is visible, not silent');
      assert.match(rows[0].reason, /section completed/);
    } finally { await pool.end(); }
  });

  it('cancelling a section is refused while a course is still being taught', async () => {
    const s = await teachingSetup();
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@offer.edu');
    await post(`/v1/offerings/${offering}/instructors`, s.token, { person_id: teacher.personId });
    await post(`/v1/offerings/${offering}/status`, s.token, { status: 'active' });

    const res = await post(`/v1/sections/${s.section}/status`, s.token, {
      status: 'cancelled', reason: 'Merged',
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /CS301/, 'names what is blocking it');
  });

  it('the database freezes an offering identity once teaching begins', async () => {
    const s = await teachingSetup();
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@offer.edu');
    await post(`/v1/offerings/${offering}/instructors`, s.token, { person_id: teacher.personId });
    await post(`/v1/offerings/${offering}/status`, s.token, { status: 'active' });

    const pool = createPool(MIGRATOR_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE course_offerings SET component = 'lab' WHERE id = $1`, [offering]),
        /identity cannot change/,
      );
    } finally { await pool.end(); }
  });
});

describe('instructor assignment preserves who taught when', () => {
  async function staffedOffering(s: Awaited<ReturnType<typeof teachingSetup>>) {
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const first = await s.staff('Ravi Kumar', 'ravi@offer.edu');
    const assignment = (await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: first.personId, role: 'lead',
    })).json().data.assignmentId;
    return { offering, first, assignment };
  }

  it('assigns a lead instructor and shows them on the offering', async () => {
    const s = await teachingSetup();
    const { offering } = await staffedOffering(s);
    const row = (await get(`/v1/offerings/${offering}`, s.token)).json().data;
    assert.equal(row.instructors.length, 1);
    assert.equal(row.instructors[0].full_name, 'Ravi Kumar');
    assert.equal(row.instructors[0].role, 'lead');
    assert.equal(row.can_activate, true);
  });

  it('refuses a second lead, because ownership of a class must be unambiguous', async () => {
    const s = await teachingSetup();
    const { offering } = await staffedOffering(s);
    const second = await s.staff('Meena Iyer', 'meena@offer.edu');

    const res = await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: second.personId, role: 'lead',
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /already has a lead/);
  });

  it('allows a co-instructor alongside the lead', async () => {
    const s = await teachingSetup();
    const { offering } = await staffedOffering(s);
    const second = await s.staff('Meena Iyer', 'meena@offer.edu');

    const res = await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: second.personId, role: 'co',
    });
    assert.equal(res.statusCode, 201);
    assert.equal((await get(`/v1/offerings/${offering}`, s.token)).json().data.instructors.length, 2);
  });

  it('refuses the same person twice on one offering', async () => {
    const s = await teachingSetup();
    const { offering, first } = await staffedOffering(s);
    const res = await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: first.personId, role: 'co',
    });
    assert.equal(res.statusCode, 409);
  });

  it('a handover ends the old assignment rather than deleting it', async () => {
    const s = await teachingSetup();
    const { offering, assignment } = await staffedOffering(s);

    const ended = await post(`/v1/instructor-assignments/${assignment}/end`, s.token, {
      reason: 'Went on medical leave',
    });
    assert.equal(ended.statusCode, 200);

    const second = await s.staff('Meena Iyer', 'meena@offer.edu');
    await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: second.personId, role: 'lead',
    });

    const history = (await get(`/v1/offerings/${offering}/instructor-history`, s.token)).json().data;
    assert.equal(history.length, 2, 'who was teaching in week three still has an answer');
    assert.equal(history[0].full_name, 'Ravi Kumar');
    assert.equal(history[0].is_current, false);
    assert.equal(history[0].end_reason, 'Went on medical leave');
    assert.equal(history[1].full_name, 'Meena Iyer');
    assert.equal(history[1].is_current, true);

    // The current view shows only the live one.
    const live = (await get(`/v1/offerings/${offering}`, s.token)).json().data;
    assert.equal(live.instructors.length, 1);
    assert.equal(live.instructors[0].full_name, 'Meena Iyer');
  });

  it('ending an assignment requires a reason, which explains the handover later', async () => {
    const s = await teachingSetup();
    const { assignment } = await staffedOffering(s);
    const res = await post(`/v1/instructor-assignments/${assignment}/end`, s.token, { reason: '' });
    assert.equal(res.statusCode, 422);
  });

  it('only staff can be assigned to teach', async () => {
    const s = await teachingSetup();
    const { offering } = await staffedOffering(s);
    const student = await post('/v1/people', s.token, {
      full_name: 'A Student', email: 'student@offer.edu', person_type: 'student',
    });

    const res = await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: student.json().data.person_id, role: 'co',
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error.message, /Only staff/);
  });

  it('a completed offering keeps its teaching history and takes no new instructor', async () => {
    const s = await teachingSetup();
    const { offering } = await staffedOffering(s);
    await post(`/v1/offerings/${offering}/status`, s.token, { status: 'active' });
    await post(`/v1/offerings/${offering}/status`, s.token, { status: 'completed' });

    const second = await s.staff('Meena Iyer', 'meena@offer.edu');
    const res = await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: second.personId, role: 'co',
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /stays as it was recorded/);
  });
});

describe('a teacher sees only their own teaching', () => {
  it('returns the offerings the signed-in person is assigned to, and their role', async () => {
    const s = await teachingSetup('mine-college');
    await startSection(s.token, s.section);
    const mine = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@mine.edu');
    await post(`/v1/offerings/${mine}/instructors`, s.token, {
      person_id: teacher.personId, role: 'lead',
    });

    const teaching = await get('/v1/me/teaching', teacher.token);
    assert.equal(teaching.statusCode, 200);
    assert.equal(teaching.json().data.length, 1);
    assert.equal(teaching.json().data[0].course.code, 'CS301');
    assert.equal(teaching.json().data[0].my_role, 'lead');
  });

  it('does not return another teacher offering', async () => {
    const s = await teachingSetup('other-college');
    await startSection(s.token, s.section);
    const other = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const assigned = await s.staff('Assigned Teacher', 'assigned@other.edu');
    const unassigned = await s.staff('Unassigned Teacher', 'unassigned@other.edu');
    await post(`/v1/offerings/${other}/instructors`, s.token, { person_id: assigned.personId });

    const theirs = await get('/v1/me/teaching', unassigned.token);
    assert.deepEqual(theirs.json().data, [], 'an unassigned teacher teaches nothing');
  });

  it('an ended assignment removes the offering from that teacher list', async () => {
    const s = await teachingSetup('ended-college');
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@ended.edu');
    const assignment = (await post(`/v1/offerings/${offering}/instructors`, s.token, {
      person_id: teacher.personId,
    })).json().data.assignmentId;

    assert.equal((await get('/v1/me/teaching', teacher.token)).json().data.length, 1);
    await post(`/v1/instructor-assignments/${assignment}/end`, s.token, { reason: 'Handover' });
    assert.deepEqual((await get('/v1/me/teaching', teacher.token)).json().data, [],
      'a stale assignment grants nothing');
  });

  it('the teacher cannot widen the list from the client', async () => {
    const s = await teachingSetup('widen-college');
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const assigned = await s.staff('Assigned', 'a@widen.edu');
    const other = await s.staff('Other', 'o@widen.edu');
    await post(`/v1/offerings/${offering}/instructors`, s.token, { person_id: assigned.personId });

    // Attempting to pass someone else's id is simply ignored: the set comes
    // from the token's subject, not from the query string.
    const attempt = await get(
      `/v1/me/teaching?instructor_id=${assigned.personId}&person_id=${assigned.personId}`,
      other.token,
    );
    assert.deepEqual(attempt.json().data, []);
  });

  it('a faculty member cannot read the college-wide offering list', async () => {
    const s = await teachingSetup('scope-offer');
    const teacher = await s.staff('Ravi Kumar', 'ravi@scope.edu');
    // Faculty holds offering.read at section scope, not institution scope.
    assert.equal((await get('/v1/offerings', teacher.token)).statusCode, 403);
  });

  it('a faculty member cannot create an offering or assign an instructor', async () => {
    const s = await teachingSetup('perm-offer');
    await startSection(s.token, s.section);
    const offering = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: s.course,
    })).json().data.id;
    const teacher = await s.staff('Ravi Kumar', 'ravi@perm.edu');

    assert.equal((await post('/v1/offerings', teacher.token, {
      section_id: s.section, course_id: s.course, component: 'lab',
    })).statusCode, 403);
    assert.equal((await post(`/v1/offerings/${offering}/instructors`, teacher.token, {
      person_id: teacher.personId,
    })).statusCode, 403);
  });

  it('a revoked role stops institution-wide reads immediately', async () => {
    const s = await teachingSetup('revoke-offer');
    const second = await s.staff('Second Admin', 'second@revoke.edu');
    await post('/v1/assignments', s.token, {
      person_id: second.personId, role_key: 'college_admin', scope_type: 'institution',
    });
    assert.equal((await get('/v1/offerings', second.token)).statusCode, 200);

    const assignment = (await get('/v1/assignments', s.token)).json().data
      .find((a: { person_name: string; role_key: string }) =>
        a.person_name === 'Second Admin' && a.role_key === 'college_admin');
    await post(`/v1/assignments/${assignment.id}/revoke`, s.token, { reason: 'Role ended' });

    assert.equal((await get('/v1/offerings', second.token)).statusCode, 403,
      'the authority cache is invalidated on revocation');
  });

  it('one college never sees another college offerings', async () => {
    const a = await teachingSetup('alpha-offer');
    const b = await teachingSetup('beta-offer');
    await post('/v1/offerings', b.token, { section_id: b.section, course_id: b.course });

    assert.deepEqual((await get('/v1/offerings', a.token)).json().data, []);
  });
});

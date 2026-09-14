/**
 * M3 Teaching Operations, slice one.
 *
 * A section is a cohort of students within a program for one term, not an
 * offering of a course. The tests that matter most are the ones proving that
 * section-scoped authority now resolves, and that a section which has started
 * teaching cannot be re-pointed.
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
const post = (url: string, t: string, body: unknown) =>
  harness.app.inject({ method: 'POST', url, headers: as(t), payload: body as never }) as Promise<LightMyRequestResponse>;
const patch = (url: string, t: string, body: unknown) =>
  harness.app.inject({ method: 'PATCH', url, headers: as(t), payload: body as never }) as Promise<LightMyRequestResponse>;

/** A college with a department, a program, an academic year and a term. */
async function teachingCollege(code = 'teach-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Teaching College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const token = ((await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99' },
  })) as LightMyRequestResponse).json().data.access_token as string;

  const campus = (await get('/v1/campuses', token)).json().data[0];
  const department = (await post('/v1/departments', token, {
    campus_id: campus.id, name: 'Computer Science', code: 'cse',
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

  return { code, token, campus: campus.id, department, program, year, term };
}

const makeSection = (c: Awaited<ReturnType<typeof teachingCollege>>, label = 'A', termNumber = 5) =>
  post('/v1/sections', c.token, {
    program_id: c.program, term_id: c.term, term_number: termNumber, label, capacity: 60,
  });

describe('academic period belongs to the calendar, not to sections', () => {
  it('creates an academic year and a term inside it', async () => {
    const c = await teachingCollege();
    const years = await get('/v1/academic-years', c.token);
    assert.equal(years.json().data[0].name, '2026-27');
    assert.equal(years.json().data[0].is_current, true);
    assert.equal(years.json().data[0].term_count, 1);
  });

  it('refuses a term that falls outside its academic year', async () => {
    const c = await teachingCollege();
    const res = await post('/v1/terms', c.token, {
      academic_year_id: c.year, sequence: 2, name: 'Stray',
      starts_on: '2028-01-01', ends_on: '2028-06-01',
    });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error.message, /must fall inside 2026-27/);
  });

  it('only one academic year is current, so downstream modules get one answer', async () => {
    const c = await teachingCollege();
    await post('/v1/academic-years', c.token, {
      name: '2027-28', starts_on: '2027-06-01', ends_on: '2028-05-31', make_current: true,
    });
    const years = (await get('/v1/academic-years', c.token)).json().data;
    assert.equal(years.filter((y: { is_current: boolean }) => y.is_current).length, 1);
    assert.equal(years.find((y: { is_current: boolean }) => y.is_current).name, '2027-28');
  });

  it('refuses a duplicate term sequence in one year', async () => {
    const c = await teachingCollege();
    const res = await post('/v1/terms', c.token, {
      academic_year_id: c.year, sequence: 1, name: 'Another Semester 1',
      starts_on: '2026-06-01', ends_on: '2026-11-30',
    });
    assert.equal(res.statusCode, 409);
  });
});

describe('FB-2: the calendar and programs can be corrected and removed', () => {
  it('renames a year, moves its dates and makes it current', async () => {
    const c = await teachingCollege();
    const other = (await post('/v1/academic-years', c.token, {
      name: '2027-28', starts_on: '2027-06-01', ends_on: '2028-05-31', make_current: true,
    })).json().data.id;

    const res = await patch(`/v1/academic-years/${c.year}`, c.token, {
      name: '2026-2027', ends_on: '2027-05-30', make_current: true,
    });
    assert.equal(res.statusCode, 200);
    const years = (await get('/v1/academic-years', c.token)).json().data;
    const year = years.find((y: { id: string }) => y.id === c.year);
    assert.equal(year.name, '2026-2027');
    assert.equal(year.ends_on, '2027-05-30');
    assert.equal(year.is_current, true);
    assert.equal(years.find((y: { id: string }) => y.id === other).is_current, false, 'still exactly one current year');
  });

  it('refuses year dates that would leave one of its terms outside', async () => {
    const c = await teachingCollege();
    const res = await patch(`/v1/academic-years/${c.year}`, c.token, { starts_on: '2026-07-01' });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error.message, /Semester 1 runs .* outside those dates/);
  });

  it("changes an unused term's name and dates, but only its name once a section uses it", async () => {
    const c = await teachingCollege();
    let res = await patch(`/v1/terms/${c.term}`, c.token, { name: 'Odd semester', ends_on: '2026-12-15' });
    assert.equal(res.statusCode, 200);

    await makeSection(c);
    res = await patch(`/v1/terms/${c.term}`, c.token, { ends_on: '2026-12-20' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /dates are fixed/);
    res = await patch(`/v1/terms/${c.term}`, c.token, { name: 'Autumn semester' });
    assert.equal(res.statusCode, 200, 'the name can still change');

    const term = (await get(`/v1/terms?academic_year_id=${c.year}`, c.token)).json().data[0];
    assert.equal(term.name, 'Autumn semester');
    assert.equal(term.ends_on, '2026-12-15');
  });

  it('archives an unused term and frees its sequence, but keeps one a section uses', async () => {
    const c = await teachingCollege();
    const second = { academic_year_id: c.year, sequence: 2, name: 'Semester 2', starts_on: '2026-12-01', ends_on: '2027-05-31' };
    const id = (await post('/v1/terms', c.token, second)).json().data.id;

    let res = await post(`/v1/terms/${id}/archive`, c.token, {});
    assert.equal(res.statusCode, 200);
    const names = (await get(`/v1/terms?academic_year_id=${c.year}`, c.token)).json().data.map((t: { name: string }) => t.name);
    assert.deepEqual(names, ['Semester 1'], 'an archived term leaves the calendar');
    res = await post('/v1/terms', c.token, second);
    assert.equal(res.statusCode, 201, 'its sequence is free again');

    await makeSection(c);
    res = await post(`/v1/terms/${c.term}/archive`, c.token, {});
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /cannot be removed/);
  });

  it('never archives the current year, nor a year that still has terms', async () => {
    const c = await teachingCollege();
    let res = await post(`/v1/academic-years/${c.year}/archive`, c.token, {});
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /current year/);

    const next = (await post('/v1/academic-years', c.token, {
      name: '2027-28', starts_on: '2027-06-01', ends_on: '2028-05-31',
    })).json().data.id;
    const term = (await post('/v1/terms', c.token, {
      academic_year_id: next, sequence: 1, name: 'Semester 1', starts_on: '2027-06-01', ends_on: '2027-11-30',
    })).json().data.id;
    res = await post(`/v1/academic-years/${next}/archive`, c.token, {});
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /still has 1 term/);

    await post(`/v1/terms/${term}/archive`, c.token, {});
    res = await post(`/v1/academic-years/${next}/archive`, c.token, { reason: 'Added by mistake' });
    assert.equal(res.statusCode, 200);
    const names = (await get('/v1/academic-years', c.token)).json().data.map((y: { name: string }) => y.name);
    assert.deepEqual(names, ['2026-27']);
    res = await post('/v1/academic-years', c.token, { name: '2027-28', starts_on: '2027-06-01', ends_on: '2028-05-31' });
    assert.equal(res.statusCode, 201, 'its name is free again');
  });

  it("renames a program and its award; its code never changes", async () => {
    const c = await teachingCollege();
    const res = await patch(`/v1/programs/${c.program}`, c.token, {
      name: 'B.Tech Computer Science and Engineering', award: 'B.Tech', code: 'something-else',
    });
    assert.equal(res.statusCode, 200);
    const program = (await get('/v1/programs', c.token)).json().data.find((p: { id: string }) => p.id === c.program);
    assert.equal(program.name, 'B.Tech Computer Science and Engineering');
    assert.equal(program.award, 'B.Tech');
    assert.equal(program.code, 'btech-cse');
  });

  it('only those who manage the calendar and programs may change them', async () => {
    const c = await teachingCollege();
    const section = (await makeSection(c)).json().data.id;
    const invited = (await post('/v1/people', c.token, {
      full_name: 'Test Teacher', email: `teacher@${c.code}.edu`, person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: section },
    })).json().data;
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: { institution_code: c.code, token: invited.invitation.token, password: 'teacher-strong-99' },
    });
    const teacher = ((await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: c.code, identifier: `teacher@${c.code}.edu`, password: 'teacher-strong-99' },
    })) as LightMyRequestResponse).json().data.access_token as string;

    assert.equal((await patch(`/v1/academic-years/${c.year}`, teacher, { name: '2026-99' })).statusCode, 403);
    assert.equal((await post(`/v1/academic-years/${c.year}/archive`, teacher, {})).statusCode, 403);
    assert.equal((await patch(`/v1/terms/${c.term}`, teacher, { name: 'Mine now' })).statusCode, 403);
    assert.equal((await post(`/v1/terms/${c.term}/archive`, teacher, {})).statusCode, 403);
    assert.equal((await patch(`/v1/programs/${c.program}`, teacher, { name: 'Renamed' })).statusCode, 403);
  });
});

describe('a section is a cohort, carrying its whole context', () => {
  it('creates a section and reports campus, department, program, year and term', async () => {
    const c = await teachingCollege();
    const created = await makeSection(c);
    assert.equal(created.statusCode, 201);

    const row = (await get('/v1/sections', c.token)).json().data[0];
    assert.equal(row.label, 'A');
    assert.equal(row.status, 'planned');
    assert.equal(row.term_number, 5);
    assert.equal(row.program.name, 'B.Tech CSE');
    assert.equal(row.department_name, 'Computer Science');
    assert.equal(row.campus_name, 'Main Campus');
    assert.equal(row.academic_year.name, '2026-27');
    assert.equal(row.term.name, 'Semester 1');
    // Deliberately absent: a section is not an offering of a course.
    assert.ok(!('course' in row));
    assert.ok(!('instructor' in row));
  });

  it('derives the academic year from the term rather than trusting the caller', async () => {
    const c = await teachingCollege();
    await makeSection(c);
    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT s.academic_year_id, t.academic_year_id AS term_year
           FROM sections s JOIN terms t ON t.id = s.term_id`,
      );
      assert.equal(rows[0].academic_year_id, rows[0].term_year);
    } finally { await pool.end(); }
  });

  it('refuses a duplicate section for the same program, year and term', async () => {
    const c = await teachingCollege();
    await makeSection(c, 'A');
    const again = await makeSection(c, 'A');
    assert.equal(again.statusCode, 409);
    assert.ok(again.json().error.field_errors.label);
  });

  it('allows the same label in a different term', async () => {
    const c = await teachingCollege();
    await makeSection(c, 'A', 5);
    const other = await makeSection(c, 'A', 6);
    assert.equal(other.statusCode, 201);
  });

  it('refuses a term beyond the length of the program', async () => {
    const c = await teachingCollege();
    // A four-year semester program runs eight terms.
    const res = await makeSection(c, 'A', 9);
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error.message, /beyond this program/);
  });
});

describe('section lifecycle', () => {
  it('moves planned to open to active to completed', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;

    for (const status of ['open', 'active', 'completed']) {
      const res = await post(`/v1/sections/${id}/status`, c.token, { status });
      assert.equal(res.statusCode, 200, `transition to ${status}`);
    }
    assert.equal((await get(`/v1/sections/${id}`, c.token)).json().data.status, 'completed');
  });

  it('lets an administrator take back an opening while nobody is enrolled', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    await post(`/v1/sections/${id}/status`, c.token, { status: 'open' });

    const back = await post(`/v1/sections/${id}/status`, c.token, { status: 'planned' });
    assert.equal(back.statusCode, 200);
  });

  it('refuses to return to planning once teaching has begun', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    await post(`/v1/sections/${id}/status`, c.token, { status: 'open' });
    await post(`/v1/sections/${id}/status`, c.token, { status: 'active' });

    const res = await post(`/v1/sections/${id}/status`, c.token, { status: 'planned' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /Teaching has begun/);
  });

  it('a completed section is terminal, because records reference it', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    for (const status of ['open', 'active', 'completed']) {
      await post(`/v1/sections/${id}/status`, c.token, { status });
    }
    const res = await post(`/v1/sections/${id}/status`, c.token, { status: 'active' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /Attendance and results reference it/);
  });

  it('cancelling requires a reason', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    const res = await post(`/v1/sections/${id}/status`, c.token, { status: 'cancelled' });
    assert.equal(res.statusCode, 422);
  });

  it('a cancelled label becomes reusable, since it taught nobody', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c, 'A')).json().data.id;
    await post(`/v1/sections/${id}/status`, c.token, {
      status: 'cancelled', reason: 'Intake did not fill',
    });

    const reused = await makeSection(c, 'A');
    assert.equal(reused.statusCode, 201);
  });

  it('the database refuses an invalid transition even when the application is bypassed', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;

    const pool = createPool(MIGRATOR_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE sections SET status = 'completed' WHERE id = $1`, [id]),
        /cannot go from planned to completed/,
      );
    } finally { await pool.end(); }
  });

  it('the database freezes identity once a section is active', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    await post(`/v1/sections/${id}/status`, c.token, { status: 'open' });
    await post(`/v1/sections/${id}/status`, c.token, { status: 'active' });

    const pool = createPool(MIGRATOR_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE sections SET label = 'Z' WHERE id = $1`, [id]),
        /identity cannot change/,
        're-pointing a started section would move records between cohorts',
      );
    } finally { await pool.end(); }
  });

  it('capacity may rise mid-term, because colleges add seats', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    await post(`/v1/sections/${id}/status`, c.token, { status: 'open' });
    await post(`/v1/sections/${id}/status`, c.token, { status: 'active' });

    const res = await patch(`/v1/sections/${id}/capacity`, c.token, { capacity: 70 });
    assert.equal(res.statusCode, 200);
  });

  it('records each transition in the audit trail with its reason', async () => {
    const c = await teachingCollege();
    const id = (await makeSection(c)).json().data.id;
    await post(`/v1/sections/${id}/status`, c.token, { status: 'open' });
    await post(`/v1/sections/${id}/status`, c.token, {
      status: 'cancelled', reason: 'Merged with section B',
    });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT action, reason FROM audit_events WHERE subject_id = $1 ORDER BY at`, [id],
      );
      assert.deepEqual(rows.map((r) => r.action),
        ['section.created', 'section.open', 'section.cancelled']);
      assert.equal(rows[2].reason, 'Merged with section B');
    } finally { await pool.end(); }
  });
});

describe('section scope now resolves, which was the point of this slice', () => {
  it('a section-scoped grant can be made and is visible on the person', async () => {
    const c = await teachingCollege('scope-college');
    const sectionId = (await makeSection(c)).json().data.id;

    const invited = await post('/v1/people', c.token, {
      full_name: 'Meena Iyer', email: 'meena@scope.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: sectionId },
    });
    assert.equal(invited.statusCode, 201,
      'the Faculty role has declared section scope since migration 001 and can finally use it');

    const assignment = (await get('/v1/assignments', c.token)).json().data
      .find((a: { person_name: string }) => a.person_name === 'Meena Iyer');
    assert.equal(assignment.scope_type, 'section');
    assert.equal(assignment.scope_ref_id, sectionId);
  });

  it('section ancestry reaches program, department and campus', async () => {
    const c = await teachingCollege('ancestry-college');
    const sectionId = (await makeSection(c)).json().data.id;

    const { PgOrgTreeReader } = await import('../src/modules/identity/infrastructure/repositories.ts');
    const reader = new PgOrgTreeReader();
    const ancestry = await harness.container.uow.run(
      (await get('/v1/sections', c.token)).json().data[0] && c.token
        ? await tenantOf(c.token) : null,
      (tx) => reader.ancestryOf(tx, 'section', sectionId),
    );

    assert.deepEqual(ancestry.map((a) => a.type), ['program', 'department', 'campus'],
      'exactly the chain M1 has documented since migration 001');
    assert.equal(ancestry[0]!.refId, c.program);
    assert.equal(ancestry[1]!.refId, c.department);
    assert.equal(ancestry[2]!.refId, c.campus);
  });

  async function tenantOf(token: string): Promise<string> {
    const me = await get('/v1/auth/me', token);
    return me.json().data.tenant_id as string;
  }
});

describe('authorization and isolation', () => {
  it('a faculty member can read sections but cannot create one', async () => {
    const c = await teachingCollege('perm-teach');
    const sectionId = (await makeSection(c)).json().data.id;
    const invited = await post('/v1/people', c.token, {
      full_name: 'Plain Faculty', email: 'plain@perm.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: sectionId },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: c.code, token: invited.json().data.invitation.token,
        password: 'plain-strong-99',
      },
    });
    const faculty = ((await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: c.code, identifier: 'plain@perm.edu', password: 'plain-strong-99' },
    })) as LightMyRequestResponse).json().data.access_token;

    // Faculty holds section.read at section scope, not institution scope, so
    // the institution-wide list is out of reach and creation certainly is.
    assert.equal((await get('/v1/sections', faculty)).statusCode, 403);
    assert.equal(
      (await post('/v1/sections', faculty, {
        program_id: c.program, term_id: c.term, term_number: 5, label: 'Z',
      })).statusCode, 403,
    );
  });

  it('one college never sees another college sections or calendar', async () => {
    const a = await teachingCollege('alpha-teach');
    const b = await teachingCollege('beta-teach');
    await makeSection(b, 'B');

    assert.deepEqual((await get('/v1/sections', a.token)).json().data, []);
    const years = (await get('/v1/academic-years', a.token)).json().data;
    assert.equal(years.length, 1, 'only its own academic year');
  });
});

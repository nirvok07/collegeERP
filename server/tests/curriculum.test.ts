/**
 * The curriculum spine.
 *
 * The invariant under test (AD-3): a published curriculum version must remain
 * readable exactly as it was, for as long as any student bound to it has a
 * record. Most of these tests are attempts to violate that.
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
const del = (url: string, t: string) =>
  harness.app.inject({ method: 'DELETE', url, headers: as(t) }) as Promise<LightMyRequestResponse>;

/** A college with a department and an admin signed in. */
async function college(code = 'curric-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Curriculum College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const signedIn = (await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99' },
  })) as LightMyRequestResponse;
  const token = signedIn.json().data.access_token as string;

  const campus = (await get('/v1/campuses', token)).json().data[0];
  const department = (await post('/v1/departments', token, {
    campus_id: campus.id, name: 'Computer Science', code: 'cse',
  })).json().data.id;

  return { code, token, department };
}

/** A published two-term curriculum with one course per term. */
async function publishedCurriculum(c: Awaited<ReturnType<typeof college>>) {
  const program = (await post('/v1/programs', c.token, {
    department_id: c.department, name: 'B.Tech Computer Science', code: 'btech-cse',
    duration_years: 4, term_type: 'semester',
  })).json().data.id;

  const version = (await post('/v1/curriculum-versions', c.token, {
    program_id: program, regulation_year: 2024, total_terms: 2,
  })).json().data.id;

  const courseA = (await post('/v1/courses', c.token, { code: 'CS101', title: 'Programming' })).json().data.id;
  const courseB = (await post('/v1/courses', c.token, { code: 'CS201', title: 'Data Structures' })).json().data.id;

  await post(`/v1/curriculum-versions/${version}/entries`, c.token, {
    course_id: courseA, term_number: 1, credits: 4, requirement: 'core',
  });
  await post(`/v1/curriculum-versions/${version}/entries`, c.token, {
    course_id: courseB, term_number: 2, credits: 3, requirement: 'core',
  });
  const published = await post(`/v1/curriculum-versions/${version}/publish`, c.token, {});
  assert.equal(published.statusCode, 200);

  return { program, version, courseA, courseB };
}

describe('programs', () => {
  it('creates a program under a department', async () => {
    const c = await college();
    const res = await post('/v1/programs', c.token, {
      department_id: c.department, name: 'B.Tech CSE', code: 'btech-cse',
      duration_years: 4, term_type: 'semester',
    });
    assert.equal(res.statusCode, 201);

    const list = await get('/v1/programs', c.token);
    assert.equal(list.json().data[0].department_name, 'Computer Science');
    assert.equal(list.json().data[0].published_versions, 0);
  });

  it('refuses to archive a program whose curriculum is published', async () => {
    const c = await college();
    const { program } = await publishedCurriculum(c);
    const res = await post(`/v1/programs/${program}/archive`, c.token, { reason: 'closing' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /students may be following/i);
  });
});

describe('courses are catalogue entries, not curriculum placements', () => {
  it('a course carries no credits and no term of its own', async () => {
    const c = await college();
    await post('/v1/courses', c.token, { code: 'CS101', title: 'Programming' });
    const listed = (await get('/v1/courses', c.token)).json().data[0];
    assert.ok(!('credits' in listed), 'credits are version-specific, never global');
    assert.ok(!('term_number' in listed));
  });

  it('a course code can never be reused, because transcripts name it forever', async () => {
    const c = await college();
    await post('/v1/courses', c.token, { code: 'CS101', title: 'Programming' });
    const again = await post('/v1/courses', c.token, { code: 'CS101', title: 'Something Else' });
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /cannot be reused/i);
  });

  it('the same course appears in two versions with different credits', async () => {
    const c = await college();
    const { program, courseA, version } = await publishedCurriculum(c);

    const successor = (await post(`/v1/curriculum-versions/${version}/successor`, c.token, {
      kind: 'amendment', regulation_year: 2026, reason: 'Credit rebalance',
    })).json().data.id;

    // Remove the copied entry and re-add the same course at a different weight.
    const entries = (await get(`/v1/curriculum-versions/${successor}`, c.token)).json().data.terms;
    const copied = entries[0].courses.find((x: { course_id: string }) => x.course_id === courseA);
    await del(`/v1/curriculum-versions/${successor}/entries/${copied.id}`, c.token);
    await post(`/v1/curriculum-versions/${successor}/entries`, c.token, {
      course_id: courseA, term_number: 1, credits: 3, requirement: 'core',
    });

    const oldView = (await get(`/v1/curriculum-versions/${version}`, c.token)).json().data;
    const newView = (await get(`/v1/curriculum-versions/${successor}`, c.token)).json().data;
    assert.equal(oldView.terms[0].courses[0].credits, 4, 'the 2024 record is unchanged');
    assert.equal(newView.terms[0].courses[0].credits, 3);
    assert.ok(program);
  });

  it('retitling a course does not change what it was worth in a published year', async () => {
    const c = await college();
    const { version, courseA } = await publishedCurriculum(c);

    await patch(`/v1/courses/${courseA}`, c.token, { title: 'Introduction to Programming' });

    const view = (await get(`/v1/curriculum-versions/${version}`, c.token)).json().data;
    assert.equal(view.terms[0].courses[0].title, 'Introduction to Programming',
      'the name follows the catalogue');
    assert.equal(view.terms[0].courses[0].credits, 4, 'the weight follows the version');
  });
});

describe('published curriculum is immutable', () => {
  it('refuses to add a course to a published version', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    const course = (await post('/v1/courses', c.token, { code: 'CS999', title: 'Late Addition' })).json().data.id;

    const res = await post(`/v1/curriculum-versions/${version}/entries`, c.token, {
      course_id: course, term_number: 1, credits: 4, requirement: 'core',
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /Students may be following it/);
    assert.match(res.json().error.message, /revision|regulation year/);
  });

  it('refuses to remove a course from a published version', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    const entry = (await get(`/v1/curriculum-versions/${version}`, c.token))
      .json().data.terms[0].courses[0].id;

    const res = await del(`/v1/curriculum-versions/${version}/entries/${entry}`, c.token);
    assert.equal(res.statusCode, 409);
  });

  it('refuses to publish twice', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    const res = await post(`/v1/curriculum-versions/${version}/publish`, c.token, {});
    assert.equal(res.statusCode, 409);
  });

  it('the database refuses even when the application is bypassed', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);

    const pool = createPool(MIGRATOR_URL);
    try {
      await assert.rejects(
        pool.query(`UPDATE curriculum_versions SET total_terms = 99 WHERE id = $1`, [version]),
        /published and its definition cannot be altered/,
        'a trigger, not application discipline, is what guarantees this',
      );
      await assert.rejects(
        pool.query(`UPDATE curriculum_versions SET status = 'draft' WHERE id = $1`, [version]),
        /cannot change state/,
      );
    } finally { await pool.end(); }
  });
});

describe('successors preserve history', () => {
  it('an amendment creates a new regulation year and leaves the old one intact', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);

    const res = await post(`/v1/curriculum-versions/${version}/successor`, c.token, {
      kind: 'amendment', regulation_year: 2026, reason: 'New syllabus',
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().data.copiedEntries, 2, 'the author starts from what exists');

    const versions = (await get('/v1/curriculum-versions', c.token)).json().data;
    const original = versions.find((v: { id: string }) => v.id === version);
    assert.equal(original.status, 'published', 'the 2024 regulation still governs its cohort');
    assert.equal(original.course_count, 2);
  });

  it('a revision corrects the same regulation year and bumps the revision', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);

    const res = await post(`/v1/curriculum-versions/${version}/successor`, c.token, {
      kind: 'revision', reason: 'Credits transcribed incorrectly',
    });
    assert.equal(res.statusCode, 201);

    const versions = (await get('/v1/curriculum-versions', c.token)).json().data;
    const revision = versions.find((v: { id: string }) => v.id === res.json().data.id);
    assert.equal(revision.regulation_year, 2024, 'an erratum stays in its own year');
    assert.equal(revision.revision, 2);
  });

  it('an amendment must come after the regulation it replaces', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    const res = await post(`/v1/curriculum-versions/${version}/successor`, c.token, {
      kind: 'amendment', regulation_year: 2020, reason: 'backwards',
    });
    assert.equal(res.statusCode, 422);
  });

  it('a successor requires a reason, so the audit trail explains the change', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    const res = await post(`/v1/curriculum-versions/${version}/successor`, c.token, {
      kind: 'revision', reason: '',
    });
    assert.equal(res.statusCode, 422);
  });

  it('records which kind of successor it was, since only an erratum rebinds students', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    await post(`/v1/curriculum-versions/${version}/successor`, c.token, {
      kind: 'revision', reason: 'Typo in credits',
    });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT action, reason FROM audit_events WHERE action LIKE 'curriculum.%_started'`,
      );
      assert.equal(rows[0].action, 'curriculum.revision_started');
      assert.equal(rows[0].reason, 'Typo in credits');
    } finally { await pool.end(); }
  });
});

describe('publication validates the whole document', () => {
  it('refuses to publish an empty curriculum', async () => {
    const c = await college();
    const program = (await post('/v1/programs', c.token, {
      department_id: c.department, name: 'B.Com', code: 'bcom', duration_years: 3,
    })).json().data.id;
    const version = (await post('/v1/curriculum-versions', c.token, {
      program_id: program, regulation_year: 2024, total_terms: 2,
    })).json().data.id;

    const res = await post(`/v1/curriculum-versions/${version}/publish`, c.token, {});
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error.message, /bind students to nothing/);
  });

  it('refuses to publish with an empty term, and names which', async () => {
    const c = await college();
    const program = (await post('/v1/programs', c.token, {
      department_id: c.department, name: 'B.Sc', code: 'bsc', duration_years: 3,
    })).json().data.id;
    const version = (await post('/v1/curriculum-versions', c.token, {
      program_id: program, regulation_year: 2024, total_terms: 3,
    })).json().data.id;
    const course = (await post('/v1/courses', c.token, { code: 'SC101', title: 'Physics' })).json().data.id;
    await post(`/v1/curriculum-versions/${version}/entries`, c.token, {
      course_id: course, term_number: 1, credits: 4,
    });

    const res = await post(`/v1/curriculum-versions/${version}/publish`, c.token, {});
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error.message, /terms 2, 3/);
  });

  it('refuses a term beyond the curriculum length', async () => {
    const c = await college();
    const program = (await post('/v1/programs', c.token, {
      department_id: c.department, name: 'B.A', code: 'ba', duration_years: 3,
    })).json().data.id;
    const version = (await post('/v1/curriculum-versions', c.token, {
      program_id: program, regulation_year: 2024, total_terms: 2,
    })).json().data.id;
    const course = (await post('/v1/courses', c.token, { code: 'AR101', title: 'History' })).json().data.id;

    const res = await post(`/v1/curriculum-versions/${version}/entries`, c.token, {
      course_id: course, term_number: 7, credits: 4,
    });
    assert.equal(res.statusCode, 422);
  });

  it('refuses a second draft for a regulation year already published', async () => {
    const c = await college();
    const { program } = await publishedCurriculum(c);
    const res = await post('/v1/curriculum-versions', c.token, {
      program_id: program, regulation_year: 2024, total_terms: 2,
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /revision|new regulation year/);
  });
});

describe('authorization and isolation', () => {
  it('reading is broad, authoring is department management', async () => {
    const c = await college('auth-curric');
    const invited = await post('/v1/people', c.token, {
      full_name: 'Plain Faculty', email: 'plain@auth.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'department', scope_ref_id: c.department },
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
      payload: { institution_code: c.code, identifier: 'plain@auth.edu', password: 'plain-strong-99' },
    })) as LightMyRequestResponse).json().data.access_token;

    // Faculty holds person.read at department scope only, so an
    // institution-scoped read is out of reach, and authoring certainly is.
    assert.equal((await get('/v1/programs', faculty)).statusCode, 403);
    assert.equal(
      (await post('/v1/courses', faculty, { code: 'XX101', title: 'Sneaky' })).statusCode, 403,
    );
  });

  it('one college never sees another college curriculum', async () => {
    const a = await college('alpha-curric');
    const b = await college('beta-curric');
    await publishedCurriculum(b);

    assert.deepEqual((await get('/v1/programs', a.token)).json().data, []);
    assert.deepEqual((await get('/v1/curriculum-versions', a.token)).json().data, []);
    assert.deepEqual((await get('/v1/courses', a.token)).json().data, []);
  });
});

describe('reading a curriculum', () => {
  it('returns terms with their courses and credit totals', async () => {
    const c = await college();
    const { version } = await publishedCurriculum(c);
    const data = (await get(`/v1/curriculum-versions/${version}`, c.token)).json().data;

    assert.equal(data.status, 'published');
    assert.equal(data.editable, false, 'stated, so no client offers an edit the database refuses');
    assert.equal(data.total_credits, 7);
    assert.equal(data.terms.length, 2);
    assert.equal(data.terms[0].credits, 4);
    assert.equal(data.terms[1].courses[0].code, 'CS201');
  });

  it('a draft is marked editable', async () => {
    const c = await college();
    const program = (await post('/v1/programs', c.token, {
      department_id: c.department, name: 'M.Tech', code: 'mtech', duration_years: 2,
    })).json().data.id;
    const version = (await post('/v1/curriculum-versions', c.token, {
      program_id: program, regulation_year: 2025, total_terms: 4,
    })).json().data.id;

    const data = (await get(`/v1/curriculum-versions/${version}`, c.token)).json().data;
    assert.equal(data.editable, true);
  });
});

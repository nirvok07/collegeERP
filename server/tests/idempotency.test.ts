/**
 * Replay-safe field writes (AD-58).
 *
 * The tests that matter prove four things. A write resent with its key gets the
 * original outcome and is not applied twice, where without the key it is
 * refused as a false conflict. A key never answers a different request. A key
 * belongs to one person, so nobody else's outcome can be replayed. And only the
 * routes that opt in store anything.
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

const headers = (t: string, key?: string) => ({
  authorization: `Bearer ${t}`,
  ...(key ? { 'idempotency-key': key } : {}),
});
const get = (url: string, t: string) =>
  harness.app.inject({ method: 'GET', url, headers: headers(t) }) as Promise<LightMyRequestResponse>;
const send = (method: 'POST' | 'PUT', url: string, t: string, body: unknown, key?: string) =>
  harness.app.inject({
    method, url, headers: headers(t, key), payload: body as never,
  }) as Promise<LightMyRequestResponse>;

/** One class that happened, two enrolled students, a teacher who leads the course. */
async function oneClass(code = 'idem-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Idempotency College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const token = ((await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99' },
  })) as LightMyRequestResponse).json().data.access_token as string;

  const post = (url: string, body: unknown) => send('POST', url, token, body);
  const campus = (await get('/v1/campuses', token)).json().data[0].id;
  const department = (await post('/v1/departments', { campus_id: campus, name: 'CS', code: 'cse' })).json().data.id;
  const program = (await post('/v1/programs', {
    department_id: department, name: 'B.Tech CSE', code: 'btech-cse', duration_years: 4, term_type: 'semester',
  })).json().data.id;
  const year = (await post('/v1/academic-years', {
    name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true,
  })).json().data.id;
  const term = (await post('/v1/terms', {
    academic_year_id: year, sequence: 1, name: 'Semester 1', starts_on: '2026-06-01', ends_on: '2026-11-30',
  })).json().data.id;
  const section = (await post('/v1/sections', {
    program_id: program, term_id: term, term_number: 5, label: 'A',
  })).json().data.id;
  await post(`/v1/sections/${section}/status`, { status: 'open' });
  await post(`/v1/sections/${section}/status`, { status: 'active' });
  const course = (await post('/v1/courses', { code: 'CS301', title: 'Operating Systems' })).json().data.id;
  const offering = (await post('/v1/offerings', { section_id: section, course_id: course })).json().data.id;

  const invited = await post('/v1/people', {
    full_name: 'Asha Menon', email: `asha@${code}.edu`, person_type: 'staff',
    role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: section },
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: invited.json().data.invitation.token, password: 'staff-strong-99' },
  });
  const teacher = ((await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `asha@${code}.edu`, password: 'staff-strong-99' },
  })) as LightMyRequestResponse).json().data.access_token as string;
  await post(`/v1/offerings/${offering}/instructors`, { person_id: invited.json().data.person_id, role: 'lead' });

  const admit = async (name: string, number: string) => {
    const s = (await post('/v1/students', {
      full_name: name, enrolment_number: number, program_id: program, admitted_on: '2026-06-01',
    })).json().data as { id: string };
    await post(`/v1/sections/${section}/members`, { student_id: s.id, from: '2026-06-01' });
    return s.id;
  };
  const nisha = await admit('Nisha Kumar', 'cse2026-001');
  const ravi = await admit('Ravi Nair', 'cse2026-002');
  const classOn = async (date: string) => (await post('/v1/sessions', {
    offering_id: offering, session_date: date, starts_at: '09:00', ends_at: '10:00',
  })).json().data.id as string;
  const session = await classOn('2026-06-02');

  return { code, token, teacher, nisha, ravi, session, classOn, adminEmail: `admin@${code}.edu` };
}

const mark = (c: { nisha: string }, version = 0) => ({
  version, marks: [{ student_id: c.nisha, state: 'present' }],
});

describe('a write resent with its key gets its first outcome back', () => {
  it('replays the original response and does not apply the write twice', async () => {
    const c = await oneClass();
    const url = `/v1/sessions/${c.session}/attendance`;
    const first = await send('PUT', url, c.teacher, mark(c), 'save-attempt-0001');
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().data.version, 1);

    // The response was lost; the phone sends the same write again.
    const again = await send('PUT', url, c.teacher, mark(c), 'save-attempt-0001');
    assert.equal(again.statusCode, 200);
    assert.deepEqual(again.json().data, first.json().data);
    assert.equal(again.headers['idempotent-replayed'], 'true');

    const sheet = (await get(url, c.token)).json().data;
    assert.equal(sheet.sheet.version, 1, 'applied once, not twice');
  });

  it('without a key the same resend is refused as a false conflict, which is the defect this fixes', async () => {
    const c = await oneClass();
    const url = `/v1/sessions/${c.session}/attendance`;
    await send('PUT', url, c.teacher, mark(c));
    const again = await send('PUT', url, c.teacher, mark(c));
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /Somebody else changed this register/);
  });

  it('makes a resent submission safe, which would otherwise say "already submitted"', async () => {
    const c = await oneClass();
    const url = `/v1/sessions/${c.session}/attendance`;
    await send('PUT', url, c.teacher, {
      version: 0,
      marks: [{ student_id: c.nisha, state: 'present' }, { student_id: c.ravi, state: 'absent' }],
    });
    const submit = `${url}/submit`;
    const first = await send('POST', submit, c.teacher, { version: 1 }, 'submit-attempt-01');
    assert.equal(first.statusCode, 200);
    const again = await send('POST', submit, c.teacher, { version: 1 }, 'submit-attempt-01');
    assert.equal(again.statusCode, 200);
    assert.equal(again.headers['idempotent-replayed'], 'true');
  });

  it('makes a resent "I taught this class" safe', async () => {
    const c = await oneClass();
    const url = `/v1/sessions/${c.session}/complete`;
    assert.equal((await send('POST', url, c.teacher, {}, 'taught-attempt-01')).statusCode, 200);
    const again = await send('POST', url, c.teacher, {}, 'taught-attempt-01');
    assert.equal(again.statusCode, 200, 'not "already recorded as taught"');
    assert.equal(again.headers['idempotent-replayed'], 'true');
  });

  it('replays a refusal exactly too, because the same request gets the same answer', async () => {
    const c = await oneClass();
    const submit = `/v1/sessions/${c.session}/attendance/submit`;
    await send('PUT', `/v1/sessions/${c.session}/attendance`, c.teacher, mark(c));
    const first = await send('POST', submit, c.teacher, { version: 1 }, 'early-submit-001');
    assert.equal(first.statusCode, 409, 'a student has no mark yet');
    const again = await send('POST', submit, c.teacher, { version: 1 }, 'early-submit-001');
    assert.equal(again.statusCode, 409);
    assert.equal(again.headers['idempotent-replayed'], 'true');
  });
});

describe('a key never answers a different request', () => {
  it('refuses the same key sent with a different body', async () => {
    const c = await oneClass();
    const url = `/v1/sessions/${c.session}/attendance`;
    await send('PUT', url, c.teacher, mark(c), 'reused-key-0001');
    const other = await send('PUT', url, c.teacher, {
      version: 1, marks: [{ student_id: c.ravi, state: 'absent' }],
    }, 'reused-key-0001');
    assert.equal(other.statusCode, 422);
    assert.match(other.json().error.message, /already used for a different request/);
  });

  it('refuses the same key sent to a different resource', async () => {
    const c = await oneClass();
    const second = await c.classOn('2026-06-03');
    await send('PUT', `/v1/sessions/${c.session}/attendance`, c.teacher, mark(c), 'moved-key-00001');
    const other = await send('PUT', `/v1/sessions/${second}/attendance`, c.teacher, mark(c), 'moved-key-00001');
    assert.equal(other.statusCode, 422);
  });

  it('refuses a malformed key', async () => {
    const c = await oneClass();
    const bad = await send('PUT', `/v1/sessions/${c.session}/attendance`, c.teacher, mark(c), 'bad key!');
    assert.equal(bad.statusCode, 422);
  });
});

describe('a key belongs to one person', () => {
  it('never replays another person\'s outcome, even for an identical request', async () => {
    const c = await oneClass();
    const url = `/v1/sessions/${c.session}/attendance`;
    const admin = await send('PUT', url, c.token, mark(c), 'shared-key-00001');
    assert.equal(admin.statusCode, 200);

    // Same key, same body, different person: their own request, run for real.
    const teacher = await send('PUT', url, c.teacher, mark(c), 'shared-key-00001');
    assert.equal(teacher.statusCode, 409, 'version 0 is stale now, and that is the honest answer');
    assert.equal(teacher.headers['idempotent-replayed'], undefined);
  });
});

describe('two sends at once, and abandoned reservations', () => {
  async function seedReservation(c: { adminEmail: string }, key: string, age: string) {
    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT tenant_id, id FROM persons WHERE primary_email = $1`, [c.adminEmail],
      );
      await pool.query(
        `INSERT INTO idempotency_keys
           (tenant_id, actor_id, key, method, route, target, request_hash, created_at)
         VALUES ($1, $2, $3, 'PUT', 'x', 'x', 'x', now() - $4::interval)`,
        [rows[0].tenant_id, rows[0].id, key, age],
      );
    } finally {
      await pool.end();
    }
  }

  it('tells a concurrent duplicate to try again, rather than running it twice', async () => {
    const c = await oneClass();
    await seedReservation(c, 'running-key-0001', '1 second');
    const dup = await send('PUT', `/v1/sessions/${c.session}/attendance`, c.token, mark(c), 'running-key-0001');
    assert.equal(dup.statusCode, 409);
    assert.match(dup.json().error.message, /still being processed/);
  });

  it('takes over a reservation abandoned by a crash', async () => {
    const c = await oneClass();
    await seedReservation(c, 'crashed-key-0001', '3 minutes');
    const retried = await send('PUT', `/v1/sessions/${c.session}/attendance`, c.token, mark(c), 'crashed-key-0001');
    assert.equal(retried.statusCode, 200);
  });
});

describe('only the routes that opt in store anything', () => {
  it('ignores the header on a route that is not marked idempotent', async () => {
    const c = await oneClass();
    const first = await send('POST', '/v1/non-teaching-days', c.token,
      { on_date: '2026-06-08', label: 'Holiday' }, 'not-an-idem-route');
    const second = await send('POST', '/v1/non-teaching-days', c.token,
      { on_date: '2026-06-09', label: 'Another' }, 'not-an-idem-route');
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201, 'not refused as a reused key: nothing was stored');
  });

  it('behaves exactly as before when no key is sent', async () => {
    const c = await oneClass();
    const saved = await send('PUT', `/v1/sessions/${c.session}/attendance`, c.teacher, mark(c));
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.headers['idempotent-replayed'], undefined);
  });
});

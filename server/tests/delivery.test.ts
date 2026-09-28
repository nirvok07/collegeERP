/**
 * M4 teaching delivery: rooms, the weekly timetable, and class sessions.
 *
 * The tests that matter most prove four things: a session that has been taught
 * cannot be moved, generation is safe to run twice, two classes cannot claim one
 * room or one teacher, and a teacher can record only the teaching they are
 * actually assigned.
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
const del = (url: string, t: string) =>
  harness.app.inject({ method: 'DELETE', url, headers: as(t) }) as Promise<LightMyRequestResponse>;

/**
 * A college teaching one course to one live cohort, with a room to teach it in.
 *
 * The term runs 1 June to 30 November 2026. 1 June is a Monday, which is what
 * makes the generated Monday dates in these tests predictable.
 */
async function deliverySetup(code = 'delivery-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Delivery College', adminEmail: `admin@${code}.edu`,
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

  const room = (await post('/v1/rooms', token, {
    campus_id: campus, code: 'LH-204', name: 'Lecture Hall 204', capacity: 70,
  })).json().data.id;

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

  /** A course offered to the live cohort, staffed and started. */
  async function offering(courseCode: string, title: string, teacherEmail: string) {
    const course = (await post('/v1/courses', token, { code: courseCode, title }))
      .json().data.id;
    const id = (await post('/v1/offerings', token, {
      section_id: section, course_id: course,
    })).json().data.id;
    const teacher = await staff(`Teacher ${courseCode}`, teacherEmail);
    await post(`/v1/offerings/${id}/instructors`, token, {
      person_id: teacher.personId, role: 'lead',
    });
    return { id, course, teacher };
  }

  return { code, token, campus, department, program, year, term, section, room, staff, offering };
}

describe('rooms are the minimum a class needs to have a place', () => {
  it('normalises the code so one room cannot become two that never collide', async () => {
    const s = await deliverySetup();
    const created = await post('/v1/rooms', s.token, {
      campus_id: s.campus, code: 'lh-301', name: 'Lecture Hall 301',
    });
    assert.equal(created.statusCode, 201);
    const rooms = (await get('/v1/rooms', s.token)).json().data;
    assert.ok(rooms.some((r: any) => r.code === 'LH-301'));
  });

  it('refuses the same code twice on one campus', async () => {
    const s = await deliverySetup();
    const again = await post('/v1/rooms', s.token, {
      campus_id: s.campus, code: 'LH-204', name: 'Another 204',
    });
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /already exists/);
  });

  it('refuses to archive a room the timetable still uses, and says how many', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    const archived = await post(`/v1/rooms/${s.room}/archive`, s.token);
    assert.equal(archived.statusCode, 409);
    assert.match(archived.json().error.message, /still holds 1 timetable slot/);
  });
});

describe('the academic calendar decides which days can hold a class', () => {
  it('records a non-teaching day with the reason in the institution words', async () => {
    const s = await deliverySetup();
    const created = await post('/v1/non-teaching-days', s.token, {
      on_date: '2026-06-08', label: 'Founder\'s Day',
    });
    assert.equal(created.statusCode, 201);
    const days = (await get('/v1/non-teaching-days?from=2026-06-01&to=2026-06-30', s.token))
      .json().data;
    assert.deepEqual(days.map((d: any) => d.on_date), ['2026-06-08']);
    assert.equal(days[0].label, 'Founder\'s Day');
  });

  it('keeps the date exactly as given, with no timezone drift', async () => {
    // A DATE is a calendar date, not an instant. Parsed as a local-midnight
    // Date it would come back as the previous day anywhere east of UTC.
    const s = await deliverySetup();
    await post('/v1/non-teaching-days', s.token, { on_date: '2026-06-15', label: 'Holiday' });
    const days = (await get('/v1/non-teaching-days', s.token)).json().data;
    assert.equal(days[0].on_date, '2026-06-15');
  });

  it('refuses the same date twice', async () => {
    const s = await deliverySetup();
    await post('/v1/non-teaching-days', s.token, { on_date: '2026-06-08', label: 'Holiday' });
    const again = await post('/v1/non-teaching-days', s.token, {
      on_date: '2026-06-08', label: 'Something else',
    });
    assert.equal(again.statusCode, 409);
  });
});

describe('CAL-1: the academic calendar module', () => {
  it('closes a range of days under one label', async () => {
    const s = await deliverySetup();
    const created = await post('/v1/non-teaching-days', s.token, {
      on_date: '2026-10-30', to_date: '2026-11-03', label: 'Diwali break',
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.ids.length, 5);
    const days = (await get('/v1/non-teaching-days?from=2026-10-01&to=2026-11-30', s.token)).json().data;
    assert.deepEqual(days.map((d: any) => d.on_date), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
    assert.ok(days.every((d: any) => d.label === 'Diwali break'));
  });

  it('adds all of a range or none of it, and names the day already closed', async () => {
    const s = await deliverySetup();
    await post('/v1/non-teaching-days', s.token, { on_date: '2026-11-01', label: 'Foundation Day' });
    const clash = await post('/v1/non-teaching-days', s.token, {
      on_date: '2026-10-30', to_date: '2026-11-03', label: 'Diwali break',
    });
    assert.equal(clash.statusCode, 409);
    assert.match(clash.json().error.message, /2026-11-01/);
    const days = (await get('/v1/non-teaching-days', s.token)).json().data;
    assert.deepEqual(days.map((d: any) => d.label), ['Foundation Day'], 'nothing of the range was kept');
  });

  it('refuses a backwards range, an impossible date and more than 60 days', async () => {
    const s = await deliverySetup();
    const add = (on_date: string, to_date: string) =>
      post('/v1/non-teaching-days', s.token, { on_date, to_date, label: 'Break' });
    assert.equal((await add('2026-11-05', '2026-11-01')).statusCode, 422);
    assert.equal((await add('2026-02-30', '2026-03-02')).statusCode, 422);
    assert.equal((await add('2026-06-01', '2026-08-31')).statusCode, 422);
    assert.equal((await get('/v1/non-teaching-days', s.token)).json().data.length, 0);
  });

  it('anyone signed in to the college reads it: years, terms and holidays; nobody else', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post('/v1/non-teaching-days', s.token, { on_date: '2026-08-15', label: 'Independence Day' });

    const read = await get('/v1/calendar?from=2026-08-01&to=2026-08-31', o.teacher.token);
    assert.equal(read.statusCode, 200, 'a teacher without term.manage may read it');
    const data = read.json().data;
    assert.deepEqual(data.holidays.map((d: any) => [d.on_date, d.label]), [['2026-08-15', 'Independence Day']]);
    assert.deepEqual(data.periods.map((p: any) => [p.kind, p.name]), [['year', '2026-27'], ['term', 'Semester 1']]);
    assert.equal(data.periods[1].year_name, '2026-27');
    assert.equal(data.periods[0].is_current, true);

    // Outside the range, no holiday; still the year and term that span it.
    assert.equal((await get('/v1/calendar?from=2026-09-01&to=2026-09-30', o.teacher.token)).json().data.holidays.length, 0);
    // Only the administrator changes it.
    assert.equal((await post('/v1/non-teaching-days', o.teacher.token, {
      on_date: '2026-09-01', to_date: '2026-09-02', label: 'Break',
    })).statusCode, 403);
    assert.equal((await harness.app.inject({ method: 'GET', url: '/v1/calendar' })).statusCode, 401);
    assert.equal((await get('/v1/calendar?from=01-08-2026', s.token)).statusCode, 422);
  });

  it('another college\'s holidays are not in it', async () => {
    const a = await deliverySetup('calendar-a');
    const b = await deliverySetup('calendar-b');
    await post('/v1/non-teaching-days', a.token, { on_date: '2026-08-15', label: 'Only in A' });
    assert.equal((await get('/v1/calendar', b.token)).json().data.holidays.length, 0);
  });
});

describe('CAL-2: events on the academic calendar', () => {
  it('a full-day event and a timed one are added, read by a teacher, changed and removed', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const farewell = await post('/v1/calendar/events', s.token, { title: 'Farewell party', on_date: '2026-09-04' });
    assert.equal(farewell.statusCode, 201, farewell.body);
    const teachersDay = await post('/v1/calendar/events', s.token, {
      title: "Teachers' Day celebration", on_date: '2026-09-05', starts_at: '11:00', ends_at: '14:00', note: 'Main hall',
    });
    assert.equal(teachersDay.statusCode, 201, teachersDay.body);

    const read = (await get('/v1/calendar?from=2026-09-01&to=2026-09-30', o.teacher.token)).json().data;
    assert.deepEqual(read.events.map((e: any) => [e.title, e.on_date, e.starts_at, e.ends_at]), [
      ['Farewell party', '2026-09-04', null, null],
      ["Teachers' Day celebration", '2026-09-05', '11:00', '14:00'],
    ]);
    assert.equal(read.events[1].note, 'Main hall');

    const id = teachersDay.json().data.id;
    assert.equal((await patch(`/v1/calendar/events/${id}`, s.token, {
      title: "Teachers' Day", on_date: '2026-09-05', starts_at: '10:30', ends_at: '13:00',
    })).statusCode, 200);
    const changed = (await get('/v1/calendar', s.token)).json().data.events.find((e: any) => e.id === id);
    assert.deepEqual([changed.title, changed.starts_at, changed.note], ["Teachers' Day", '10:30', null]);

    assert.equal((await del(`/v1/calendar/events/${id}`, s.token)).statusCode, 200);
    assert.equal((await del(`/v1/calendar/events/${id}`, s.token)).statusCode, 404, 'already removed');
    assert.deepEqual((await get('/v1/calendar', s.token)).json().data.events.map((e: any) => e.title), ['Farewell party']);
  });

  it('an event does not close the day: classes are still generated on it', async () => {
    const s = await deliverySetup();
    await post('/v1/calendar/events', s.token, { title: 'Sports day', on_date: '2026-06-08' });
    assert.equal((await get('/v1/non-teaching-days', s.token)).json().data.length, 0);
  });

  it('refuses half a time range, an end before the start, a missing name and an impossible date', async () => {
    const s = await deliverySetup();
    const add = (body: object) => post('/v1/calendar/events', s.token, { title: 'Fest', on_date: '2026-09-10', ...body });
    assert.equal((await add({ starts_at: '11:00' })).statusCode, 422);
    assert.equal((await add({ starts_at: '14:00', ends_at: '11:00' })).statusCode, 422);
    assert.equal((await add({ title: '   ' })).statusCode, 422);
    assert.equal((await add({ on_date: '2026-02-30' })).statusCode, 422);
    assert.equal((await get('/v1/calendar', s.token)).json().data.events.length, 0);
  });

  it('only the College Admin adds, changes or removes events', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const id = (await post('/v1/calendar/events', s.token, { title: 'Fest', on_date: '2026-09-10' })).json().data.id;
    assert.equal((await post('/v1/calendar/events', o.teacher.token, { title: 'Mine', on_date: '2026-09-11' })).statusCode, 403);
    assert.equal((await patch(`/v1/calendar/events/${id}`, o.teacher.token, { title: 'X', on_date: '2026-09-10' })).statusCode, 403);
    assert.equal((await del(`/v1/calendar/events/${id}`, o.teacher.token)).statusCode, 403);
  });
});

describe('the weekly pattern is edited; the occurrences are facts', () => {
  it('refuses two slots for one course at the same hour on the same day', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    const again = await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    assert.equal(again.statusCode, 409);
  });

  it('refuses two courses in one room at the same hour in the same term', async () => {
    const s = await deliverySetup();
    const a = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const b = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    await post(`/v1/offerings/${a.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    const clash = await post(`/v1/offerings/${b.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:30', ends_at: '10:30', room_id: s.room,
    });
    assert.equal(clash.statusCode, 409);
    assert.match(clash.json().error.message, /LH-204 already holds CS301/);
  });

  it('allows back-to-back classes in one room, which is how timetables are built', async () => {
    const s = await deliverySetup();
    const a = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const b = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    await post(`/v1/offerings/${a.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    const next = await post(`/v1/offerings/${b.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '10:00', ends_at: '11:00', room_id: s.room,
    });
    assert.equal(next.statusCode, 201);
  });

  it('leaves generated classes alone when the pattern is removed', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const slot = (await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    })).json().data.id;
    await post(`/v1/offerings/${o.id}/sessions`, s.token, { from: '2026-06-01', to: '2026-06-30' });

    const removed = await del(`/v1/slots/${slot}`, s.token);
    assert.equal(removed.statusCode, 200);

    // Removing a weekly pattern is not a claim that last Monday's class did
    // not happen.
    const sessions = (await get(`/v1/sessions?offering_id=${o.id}`, s.token)).json().data;
    assert.equal(sessions.length, 5);
    assert.deepEqual((await get(`/v1/slots?offering_id=${o.id}`, s.token)).json().data, []);
  });
});

describe('generating classes from the pattern', () => {
  it('creates one class per matching weekday inside the window', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });

    const report = await post(`/v1/offerings/${o.id}/sessions`, s.token, {
      from: '2026-06-01', to: '2026-06-30',
    });
    assert.equal(report.statusCode, 201);
    assert.equal(report.json().data.created, 5);

    const sessions = (await get(`/v1/sessions?offering_id=${o.id}`, s.token)).json().data;
    assert.deepEqual(
      sessions.map((x: any) => x.date),
      ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'],
    );
    assert.equal(sessions[0].starts_at, '09:00');
    assert.equal(sessions[0].room.code, 'LH-204');
    assert.equal(sessions[0].status, 'scheduled');
  });

  it('skips a non-teaching day and names it', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post('/v1/non-teaching-days', s.token, { on_date: '2026-06-08', label: 'Bandh' });
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });

    const report = (await post(`/v1/offerings/${o.id}/sessions`, s.token, {
      from: '2026-06-01', to: '2026-06-30',
    })).json().data;
    assert.equal(report.created, 4);
    assert.deepEqual(report.skipped_days, [{ date: '2026-06-08', label: 'Bandh' }]);
  });

  it('is safe to run twice, because a coordinator will run it twice', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    await post(`/v1/offerings/${o.id}/sessions`, s.token, { from: '2026-06-01', to: '2026-06-30' });

    const second = (await post(`/v1/offerings/${o.id}/sessions`, s.token, {
      from: '2026-06-01', to: '2026-06-30',
    })).json().data;
    assert.equal(second.created, 0);
    assert.equal(second.already_scheduled, 5);
    assert.equal((await get(`/v1/sessions?offering_id=${o.id}`, s.token)).json().data.length, 5);
  });

  it('does not create duplicate occurrences when two slots share a time', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@duplicate-slot.edu');
    const otherRoom = (await post('/v1/rooms', s.token, {
      campus_id: s.campus, code: 'LH-205', name: 'Lecture Hall 205', capacity: 70,
    })).json().data.id;
    for (const roomId of [s.room, otherRoom]) {
      await post(`/v1/offerings/${o.id}/slots`, s.token, {
        day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: roomId,
      });
    }

    const report = (await post(`/v1/offerings/${o.id}/sessions`, s.token, {
      from: '2026-06-01', to: '2026-06-08',
    })).json().data;
    assert.equal(report.created, 2);
    assert.equal((await get(`/v1/sessions?offering_id=${o.id}`, s.token)).json().data.length, 2);
  });

  it('clamps the window to the term rather than refusing an obvious intent', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    const report = (await post(`/v1/offerings/${o.id}/sessions`, s.token, {
      from: '2026-01-01', to: '2026-06-15', preview: true,
    })).json().data;
    assert.equal(report.from, '2026-06-01', 'starts where the term starts');
    assert.equal(report.to, '2026-06-15');
  });

  it('refuses when the course has no weekly pattern at all', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const report = await post(`/v1/offerings/${o.id}/sessions`, s.token, {});
    assert.equal(report.statusCode, 409);
    assert.match(report.json().error.message, /no weekly timetable yet/);
  });

  it('previews without writing, and reports the clash it would hit', async () => {
    const s = await deliverySetup();
    const a = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const b = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    const other = (await post('/v1/rooms', s.token, {
      campus_id: s.campus, code: 'LH-205', name: 'Lecture Hall 205',
    })).json().data.id;

    await post(`/v1/offerings/${a.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    await post(`/v1/offerings/${a.id}/sessions`, s.token, { from: '2026-06-01', to: '2026-06-08' });

    // A different room, so the slot is accepted, then moved onto the occupied
    // one. The pattern check and the occurrence check are different questions.
    const slotB = (await post(`/v1/offerings/${b.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: other,
    })).json().data.id;
    await harness.app.inject({
      method: 'POST', url: `/v1/offerings/${b.id}/sessions`,
      headers: as(s.token), payload: { from: '2026-06-01', to: '2026-06-08' } as never,
    });
    void slotB;

    // b now has its own classes in LH-205; moving one onto LH-204 clashes.
    const bSessions = (await get(`/v1/sessions?offering_id=${b.id}`, s.token)).json().data;
    const moved = await post(`/v1/sessions/${bSessions[0].id}/reschedule`, s.token, {
      session_date: '2026-06-01', starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    assert.equal(moved.statusCode, 409);
    assert.match(moved.json().error.message, /LH-204 is already teaching CS301/);
  });
});

describe('a class that has been taught does not move', () => {
  it('records teaching, then refuses to reschedule it', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/slots`, s.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00', room_id: s.room,
    });
    await post(`/v1/offerings/${o.id}/sessions`, s.token, { from: '2026-06-01', to: '2026-06-08' });
    const first = (await get(`/v1/sessions?offering_id=${o.id}`, s.token)).json().data[0];

    const done = await post(`/v1/sessions/${first.id}/complete`, s.token);
    assert.equal(done.statusCode, 200);

    const moved = await post(`/v1/sessions/${first.id}/reschedule`, s.token, {
      session_date: '2026-06-03', starts_at: '11:00', ends_at: '12:00', room_id: s.room,
    });
    assert.equal(moved.statusCode, 409);
    assert.match(moved.json().error.message, /has been taught/);
  });

  it('refuses to cancel a class that already happened', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-03', starts_at: '09:00', ends_at: '10:00',
      room_id: s.room,
    })).json().data.id;
    await post(`/v1/sessions/${session}/complete`, s.token);

    const cancelled = await post(`/v1/sessions/${session}/cancel`, s.token, { reason: 'Oops' });
    assert.equal(cancelled.statusCode, 409);
    assert.match(cancelled.json().error.message, /record stands/);
  });

  it('refuses a second completion', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-03', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;
    await post(`/v1/sessions/${session}/complete`, s.token);
    const again = await post(`/v1/sessions/${session}/complete`, s.token);
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /already recorded as taught/);
  });

  it('the database refuses a move even when the application layer is bypassed', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-03', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;
    await post(`/v1/sessions/${session}/complete`, s.token);

    // The guard that matters is the one no code path can go around.
    const direct = await patch(`/v1/sessions/${session}`, s.token, { room_id: s.room });
    assert.equal(direct.statusCode, 409);
  });

  it('remembers where a rescheduled class came from', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    await post(`/v1/sessions/${session}/reschedule`, s.token, {
      session_date: '2026-06-04', starts_at: '14:00', ends_at: '15:00',
      reason: 'Teacher at a university meeting',
    });
    const moved = (await get(`/v1/sessions/${session}`, s.token)).json().data;
    assert.equal(moved.date, '2026-06-04');
    assert.deepEqual(moved.moved_from, { date: '2026-06-02', starts_at: '09:00' });
  });

  it('cancelling requires a reason, and frees the hour for a replacement', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    const bare = await post(`/v1/sessions/${session}/cancel`, s.token, { reason: '' });
    assert.equal(bare.statusCode, 422);

    await post(`/v1/sessions/${session}/cancel`, s.token, { reason: 'Teacher unwell' });
    const replacement = await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    });
    assert.equal(replacement.statusCode, 201, 'a cancelled class taught nobody, so it frees the hour');

    const all = (await get(`/v1/sessions?offering_id=${o.id}`, s.token)).json().data;
    const cancelled = all.find((x: any) => x.status === 'cancelled');
    assert.equal(cancelled.cancelled_reason, 'Teacher unwell');
  });
});

describe('two classes cannot claim one room or one teacher', () => {
  it('refuses a second class in an occupied room', async () => {
    const s = await deliverySetup();
    const a = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const b = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    await post('/v1/sessions', s.token, {
      offering_id: a.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
      room_id: s.room,
    });
    const clash = await post('/v1/sessions', s.token, {
      offering_id: b.id, session_date: '2026-06-02', starts_at: '09:30', ends_at: '10:30',
      room_id: s.room,
    });
    assert.equal(clash.statusCode, 409);
    assert.match(clash.json().error.message, /Room LH-204 is already teaching CS301/);
  });

  it('refuses to put one teacher in two places at once', async () => {
    const s = await deliverySetup();
    const a = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    // The same person leads both courses, which is ordinary in a small college.
    const courseB = (await post('/v1/courses', s.token, { code: 'CS302', title: 'Databases' }))
      .json().data.id;
    const b = (await post('/v1/offerings', s.token, {
      section_id: s.section, course_id: courseB,
    })).json().data.id;
    await post(`/v1/offerings/${b}/instructors`, s.token, {
      person_id: a.teacher.personId, role: 'lead',
    });

    await post('/v1/sessions', s.token, {
      offering_id: a.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    });
    const clash = await post('/v1/sessions', s.token, {
      offering_id: b, session_date: '2026-06-02', starts_at: '09:30', ends_at: '10:30',
    });
    assert.equal(clash.statusCode, 409);
    assert.match(clash.json().error.message, /is already teaching CS301/);
  });

  it('lets a stand-in take a class the lead cannot, and shows who is teaching', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const standIn = await s.staff('Meera Das', 'meera@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    const changed = await patch(`/v1/sessions/${session}`, s.token, {
      stand_in_person_id: standIn.personId, reason: 'Lead at a conference',
    });
    assert.equal(changed.statusCode, 200);

    const after = (await get(`/v1/sessions/${session}`, s.token)).json().data;
    assert.equal(after.teacher.full_name, 'Meera Das');
    assert.equal(after.stand_in, true);
  });
});

describe('a class cannot exist outside the teaching it belongs to', () => {
  it('refuses a date outside the term', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const outside = await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-12-15', starts_at: '09:00', ends_at: '10:00',
    });
    assert.equal(outside.statusCode, 422);
    assert.match(outside.json().error.message, /outside the term/);
  });

  it('refuses a class for a cancelled course', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post(`/v1/offerings/${o.id}/status`, s.token, {
      status: 'cancelled', reason: 'Too few students',
    });
    const orphan = await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    });
    assert.equal(orphan.statusCode, 409);
    assert.match(orphan.json().error.message, /takes no more classes/);
  });

  it('refuses a class that ends before it starts', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const backwards = await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '11:00', ends_at: '10:00',
    });
    assert.equal(backwards.statusCode, 422);
  });
});

describe('an unmarked class is derived, never stored', () => {
  it('reports a scheduled class whose day has passed', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    });
    const unmarked = (await get('/v1/sessions?unmarked=true', s.token)).json().data;
    assert.equal(unmarked.length, 1, 'June 2026 has passed and nobody said whether it ran');
    assert.equal(unmarked[0].status, 'scheduled');
  });
});

describe('a teacher records only the teaching they are assigned', () => {
  it('shows a teacher their own classes and nobody else', async () => {
    const s = await deliverySetup();
    const mine = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const theirs = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    await post('/v1/sessions', s.token, {
      offering_id: mine.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    });
    await post('/v1/sessions', s.token, {
      offering_id: theirs.id, session_date: '2026-06-02', starts_at: '11:00', ends_at: '12:00',
    });

    const feed = (await get('/v1/me/sessions', mine.teacher.token)).json().data;
    assert.equal(feed.length, 1);
    assert.equal(feed[0].course.code, 'CS301');
    assert.equal(feed[0].i_am_teaching, true);
  });

  it('cannot widen the feed from the client', async () => {
    const s = await deliverySetup();
    const mine = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const theirs = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    await post('/v1/sessions', s.token, {
      offering_id: theirs.id, session_date: '2026-06-02', starts_at: '11:00', ends_at: '12:00',
    });

    // Every shape a client might try. The set comes from the token subject.
    for (const query of [
      `?teacher_id=${theirs.teacher.personId}`,
      `?mine_person_id=${theirs.teacher.personId}`,
      `?offering_id=${theirs.id}`,
    ]) {
      const feed = (await get(`/v1/me/sessions${query}`, mine.teacher.token)).json().data;
      assert.deepEqual(feed, [], `widened by ${query}`);
    }
  });

  it('includes a class a co-instructor shares, though the lead is the one teaching it', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const co = await s.staff('Ravi Nair', 'ravi@delivery.edu');
    await post(`/v1/offerings/${o.id}/instructors`, s.token, {
      person_id: co.personId, role: 'co',
    });
    await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    });

    const feed = (await get('/v1/me/sessions', co.token)).json().data;
    assert.equal(feed.length, 1);
    assert.equal(feed[0].i_am_teaching, false, 'the lead is recorded as teaching it');
  });

  it('lets the assigned teacher record their class as taught', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    const done = await post(`/v1/sessions/${session}/complete`, o.teacher.token);
    assert.equal(done.statusCode, 200);
    assert.equal(
      (await get(`/v1/sessions/${session}`, s.token)).json().data.status, 'completed',
    );
  });

  it('refuses a teacher recording somebody else teaching', async () => {
    const s = await deliverySetup();
    const mine = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const theirs = await s.offering('CS302', 'Databases', 'db@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: theirs.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    // The permission is held; the reach is not. That distinction is AD-40.
    const refused = await post(`/v1/sessions/${session}/complete`, mine.teacher.token);
    assert.equal(refused.statusCode, 403);
    assert.match(refused.json().error.message, /not assigned to teach this class/);
  });

  it('lets a stand-in record the one class they are covering', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const standIn = await s.staff('Meera Das', 'meera@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;
    await patch(`/v1/sessions/${session}`, s.token, { stand_in_person_id: standIn.personId });

    const done = await post(`/v1/sessions/${session}/complete`, standIn.token);
    assert.equal(done.statusCode, 200);
  });

  it('does not let a teacher read the college-wide timetable', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    // Faculty hold session.read at section scope, which is not institution scope.
    const wide = await get('/v1/sessions', o.teacher.token);
    assert.equal(wide.statusCode, 403);
  });

  it('does not let a teacher schedule, reschedule or cancel', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    const session = (await post('/v1/sessions', s.token, {
      offering_id: o.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
    })).json().data.id;

    assert.equal((await post('/v1/sessions', o.teacher.token, {
      offering_id: o.id, session_date: '2026-06-03', starts_at: '09:00', ends_at: '10:00',
    })).statusCode, 403);
    assert.equal((await post(`/v1/sessions/${session}/cancel`, o.teacher.token, {
      reason: 'I would rather not',
    })).statusCode, 403);
    assert.equal((await post(`/v1/sessions/${session}/reschedule`, o.teacher.token, {
      session_date: '2026-06-09', starts_at: '09:00', ends_at: '10:00',
    })).statusCode, 403);
  });
});

describe('reference data is not a teacher surface', () => {
  it('does not let a teacher create a room or close a day', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');

    // room.manage sits with the college administrator. A head of department
    // schedules teaching but does not create rooms on campuses they may not run.
    assert.equal((await post('/v1/rooms', o.teacher.token, {
      campus_id: s.campus, code: 'LH-999', name: 'Wishful Hall',
    })).statusCode, 403);

    // Non-teaching days are the academic calendar, which is term.manage.
    assert.equal((await post('/v1/non-teaching-days', o.teacher.token, {
      on_date: '2026-06-08', label: 'A day I would like off',
    })).statusCode, 403);
  });

  it('does not let a teacher change the weekly pattern', async () => {
    const s = await deliverySetup();
    const o = await s.offering('CS301', 'Operating Systems', 'os@delivery.edu');
    assert.equal((await post(`/v1/offerings/${o.id}/slots`, o.teacher.token, {
      day_of_week: 1, starts_at: '09:00', ends_at: '10:00',
    })).statusCode, 403);
    assert.equal((await post(`/v1/offerings/${o.id}/sessions`, o.teacher.token, {})).statusCode, 403);
  });
});

describe('tenant isolation holds for the timetable', () => {
  it('one college never sees another college classes', async () => {
    const a = await deliverySetup('delivery-a');
    const b = await deliverySetup('delivery-b');
    const offering = await a.offering('CS301', 'Operating Systems', 'os@delivery-a.edu');
    await post('/v1/sessions', a.token, {
      offering_id: offering.id, session_date: '2026-06-02', starts_at: '09:00', ends_at: '10:00',
      room_id: a.room,
    });

    assert.deepEqual((await get('/v1/sessions', b.token)).json().data, []);
    assert.deepEqual(
      (await get('/v1/rooms', b.token)).json().data.map((r: any) => r.code), ['LH-204'],
      'its own room of the same code, not the other college one',
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS, addDays, dayLabel, filterSessions, groupByDate, isFiltering, isoDayOfWeek,
  isUnmarked, needsAttention, rangeLabel, sessionWarnings, startOfWeek, unmarkedCount,
  type ClassSession,
} from './types.ts';

const session = (over: Partial<ClassSession> = {}): ClassSession => ({
  id: 's1', offering_id: 'o1', slot_id: 'slot1',
  date: '2026-06-01', starts_at: '09:00', ends_at: '10:00', status: 'scheduled',
  room: { id: 'r1', code: 'LH-204', name: 'Lecture Hall 204', campus_name: 'Main', capacity: 70 },
  teacher: { id: 'p1', full_name: 'Asha Menon' }, stand_in: false,
  course: { id: 'c1', code: 'CS301', title: 'Operating Systems' }, component: 'lecture',
  section: { id: 'sec1', label: 'A', capacity: 60 }, term_number: 5,
  program: { id: 'prog1', name: 'B.Tech CSE' }, department_name: 'Computer Science',
  term: { id: 't1', name: 'Semester 1' }, academic_year_name: '2026-27',
  cancelled_reason: null, moved_from: null, completed_at: null,
  allowed_actions: ['reschedule', 'cancel', 'complete', 'reassign'],
  room_too_small: false,
  ...over,
});

describe('calendar arithmetic stays in UTC', () => {
  it('numbers days the way the timetable does, Monday first', () => {
    expect(isoDayOfWeek('2026-06-01')).toBe(1);
    expect(isoDayOfWeek('2026-06-06')).toBe(6);
    expect(isoDayOfWeek('2026-06-07')).toBe(7);
  });

  it('walks dates without drifting across a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-06-01', 7)).toBe('2026-06-08');
  });

  it('survives a daylight-saving boundary, which a local Date would not', () => {
    // In a timezone that shifts on 29 March, local-midnight arithmetic lands on
    // 23:00 the previous day and the date reads one short.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
  });

  it('starts a week on Monday whichever day it is asked about', () => {
    expect(startOfWeek('2026-06-01')).toBe('2026-06-01');
    expect(startOfWeek('2026-06-04')).toBe('2026-06-01');
    expect(startOfWeek('2026-06-07')).toBe('2026-06-01');
    expect(startOfWeek('2026-06-08')).toBe('2026-06-08');
  });

  it('labels a day by its weekday, read in UTC', () => {
    expect(dayLabel('2026-06-01')).toMatch(/^Monday/);
    expect(dayLabel('2026-06-07')).toMatch(/^Sunday/);
  });

  it('collapses a single-day range to that day', () => {
    expect(rangeLabel('2026-06-01', '2026-06-01')).toMatch(/^Monday/);
    expect(rangeLabel('2026-06-01', '2026-06-07')).toMatch(/ to /);
  });
});

describe('an unmarked class is derived, never stored', () => {
  it('is a scheduled class whose day has gone', () => {
    expect(isUnmarked(session({ date: '2026-06-01' }), '2026-06-10')).toBe(true);
  });

  it('is not a class still to come', () => {
    expect(isUnmarked(session({ date: '2026-06-20' }), '2026-06-10')).toBe(false);
  });

  it('is not today, because the day is not over', () => {
    expect(isUnmarked(session({ date: '2026-06-10' }), '2026-06-10')).toBe(false);
  });

  it('is never a class that was taught or cancelled', () => {
    expect(isUnmarked(session({ status: 'completed', date: '2026-06-01' }), '2026-06-10')).toBe(false);
    expect(isUnmarked(session({ status: 'cancelled', date: '2026-06-01' }), '2026-06-10')).toBe(false);
  });

  it('counts only what somebody still has to answer for', () => {
    const rows = [
      session({ id: 'a', date: '2026-06-01' }),
      session({ id: 'b', date: '2026-06-02', status: 'completed' }),
      session({ id: 'c', date: '2026-06-20' }),
    ];
    expect(unmarkedCount(rows, '2026-06-10')).toBe(1);
  });
});

describe('warnings are only what an operator can act on', () => {
  it('says nothing about a class that is fine', () => {
    expect(sessionWarnings(session({ date: '2026-06-20' }), '2026-06-10')).toEqual([]);
    expect(needsAttention(session({ date: '2026-06-20' }), '2026-06-10')).toBe(false);
  });

  it('leads with the unanswered question when a class has passed unmarked', () => {
    const warnings = sessionWarnings(session({ date: '2026-06-01' }), '2026-06-10');
    expect(warnings[0]).toMatch(/whether this class ran/);
  });

  it('flags a class nobody is teaching', () => {
    const warnings = sessionWarnings(
      session({ teacher: null, date: '2026-06-20' }), '2026-06-10',
    );
    expect(warnings).toContain('No instructor is assigned to this course.');
  });

  it('flags a class with nowhere to go', () => {
    const warnings = sessionWarnings(session({ room: null, date: '2026-06-20' }), '2026-06-10');
    expect(warnings.some((w) => w.includes('No room'))).toBe(true);
  });

  it('states both numbers when the room is smaller than the cohort', () => {
    const warnings = sessionWarnings(session({
      date: '2026-06-20',
      room_too_small: true,
      room: { id: 'r1', code: 'LH-9', name: 'Small', campus_name: 'Main', capacity: 40 },
    }), '2026-06-10');
    expect(warnings.some((w) => w.includes('LH-9 seats 40') && w.includes('cohort is 60'))).toBe(true);
  });

  it('says nothing about a cancelled class beyond its cancellation', () => {
    // A cancelled class has no room problem and no unmarked problem: it is
    // resolved, and its reason is shown separately.
    const warnings = sessionWarnings(
      session({ status: 'cancelled', room: null, date: '2026-06-01' }), '2026-06-10',
    );
    expect(warnings).toEqual([]);
  });
});

describe('grouping a range into days', () => {
  it('keeps the server order and buckets by date', () => {
    const groups = groupByDate([
      session({ id: 'a', date: '2026-06-01', starts_at: '09:00' }),
      session({ id: 'b', date: '2026-06-01', starts_at: '11:00' }),
      session({ id: 'c', date: '2026-06-02', starts_at: '09:00' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('has nothing to group when the range is empty', () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe('filters', () => {
  const rows = [
    session({ id: 'a', date: '2026-06-01' }),
    session({
      id: 'b', date: '2026-06-01', status: 'completed',
      course: { id: 'c2', code: 'CS302', title: 'Databases' },
      teacher: { id: 'p2', full_name: 'Ravi Nair' },
      room: { id: 'r2', code: 'LAB-1', name: 'Lab One', campus_name: 'Main', capacity: 30 },
    }),
    session({
      id: 'c', date: '2026-06-02', program: { id: 'prog2', name: 'BBA' },
      course: { id: 'c3', code: 'BB101', title: 'Accounting' },
    }),
  ];

  it('does nothing when nothing is set', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(filterSessions(rows, NO_FILTERS, '2026-06-10')).toHaveLength(3);
  });

  it('searches the course, the cohort, the room and the teacher', () => {
    const byCourse = filterSessions(rows, { ...NO_FILTERS, query: 'databases' }, '2026-06-10');
    expect(byCourse.map((s) => s.id)).toEqual(['b']);

    const byTeacher = filterSessions(rows, { ...NO_FILTERS, query: 'ravi' }, '2026-06-10');
    expect(byTeacher.map((s) => s.id)).toEqual(['b']);

    const byRoom = filterSessions(rows, { ...NO_FILTERS, query: 'lab-1' }, '2026-06-10');
    expect(byRoom.map((s) => s.id)).toEqual(['b']);
  });

  it('narrows to one program', () => {
    const only = filterSessions(rows, { ...NO_FILTERS, programId: 'prog2' }, '2026-06-10');
    expect(only.map((s) => s.id)).toEqual(['c']);
  });

  it('narrows to one room', () => {
    const only = filterSessions(rows, { ...NO_FILTERS, roomId: 'r2' }, '2026-06-10');
    expect(only.map((s) => s.id)).toEqual(['b']);
  });

  it('narrows to one state', () => {
    const done = filterSessions(rows, { ...NO_FILTERS, status: 'completed' }, '2026-06-10');
    expect(done.map((s) => s.id)).toEqual(['b']);
  });

  it('shows only what nobody has marked', () => {
    const open = filterSessions(rows, { ...NO_FILTERS, unmarkedOnly: true }, '2026-06-10');
    expect(open.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('combines filters rather than falling back to everything', () => {
    const none = filterSessions(
      rows, { ...NO_FILTERS, programId: 'prog2', status: 'completed' }, '2026-06-10',
    );
    expect(none).toEqual([]);
  });
});

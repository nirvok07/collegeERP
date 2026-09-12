import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS, STATE_LETTER, correctionsFor, filterOverview, isFiltering, isOutstanding,
  outstandingCount, progressOf, submitBlockedReason,
  type Correction, type OverviewRow, type Register, type RegisterStudent,
} from './types.ts';

const row = (over: Partial<OverviewRow> = {}): OverviewRow => ({
  session_id: 'cs1', date: '2026-06-02', starts_at: '09:00',
  course: { code: 'CS301', title: 'Operating Systems' },
  section: { id: 'sec1', label: 'A' }, program_name: 'B.Tech CSE',
  teacher: { id: 'p1', full_name: 'Asha Menon' },
  session_status: 'completed', status: 'submitted', marked: 2,
  counts: { present: 1, absent: 1, late: 0, excused: 0 },
  submitted_at: '2026-06-02T10:00:00.000Z',
  ...over,
});

const student = (over: Partial<RegisterStudent> = {}): RegisterStudent => ({
  student_id: 'st1', full_name: 'Nisha Kumar', enrolment_number: 'CSE2026-001',
  student_status: 'enrolled', state: 'present', note: null, record_id: 'rec1',
  marked_by: 'Asha Menon', marked_at: '2026-06-02T09:05:00.000Z',
  ...over,
});

const register = (over: Partial<Register> = {}): Register => ({
  session: {
    id: 'cs1', date: '2026-06-02', starts_at: '09:00', ends_at: '10:00', status: 'completed',
    course: { id: 'c1', code: 'CS301', title: 'Operating Systems' }, component: 'lecture',
    section: { id: 'sec1', label: 'A' }, program: { id: 'p1', name: 'B.Tech CSE' },
    term: { id: 't1', name: 'Semester 1' }, room: { id: 'r1', code: 'LH-204' },
    teacher: { id: 'per1', full_name: 'Asha Menon' },
  },
  sheet: { status: 'draft', version: 1, submitted_at: null, submitted_by: null },
  students: [student(), student({ student_id: 'st2', full_name: 'Ravi Nair', state: 'absent', record_id: 'rec2' })],
  corrections: [],
  summary: { present: 1, absent: 1, late: 0, excused: 0, marked: 2, unmarked: 0, total: 2 },
  can_mark: true, can_submit: true, can_correct: false,
  ...over,
});

describe('a register nobody accounted for', () => {
  it('is one whose day has gone with nothing submitted', () => {
    expect(isOutstanding(row({ status: 'draft', date: '2026-06-02' }), '2026-06-10')).toBe(true);
  });

  it('is not a class still to come', () => {
    expect(isOutstanding(row({ status: 'draft', date: '2026-06-20' }), '2026-06-10')).toBe(false);
  });

  it('is not today, because the day is not over', () => {
    expect(isOutstanding(row({ status: 'draft', date: '2026-06-10' }), '2026-06-10')).toBe(false);
  });

  it('is never a submitted register or a cancelled class', () => {
    expect(isOutstanding(row({ status: 'submitted' }), '2026-06-10')).toBe(false);
    expect(
      isOutstanding(row({ status: 'draft', session_status: 'cancelled' }), '2026-06-10'),
    ).toBe(false);
  });

  it('counts only what somebody still owes', () => {
    const rows = [
      row({ session_id: 'a', status: 'draft', date: '2026-06-01' }),
      row({ session_id: 'b', status: 'submitted', date: '2026-06-01' }),
      row({ session_id: 'c', status: 'draft', date: '2026-06-20' }),
      row({ session_id: 'd', status: 'draft', date: '2026-06-01', session_status: 'cancelled' }),
    ];
    expect(outstandingCount(rows, '2026-06-10')).toBe(1);
  });
});

describe('how far through a register somebody is', () => {
  it('says nothing has started', () => {
    expect(progressOf(row({ status: 'draft', marked: 0 }))).toBe('Not started');
  });

  it('says how many are marked but not submitted', () => {
    expect(progressOf(row({ status: 'draft', marked: 12 }))).toBe('12 marked, not submitted');
  });

  it('reports counts on a submitted register, never a percentage', () => {
    // How late and excused count toward eligibility is a rule that belongs with
    // examinations, so this slice states facts and does no arithmetic on them.
    expect(progressOf(row({
      status: 'submitted', counts: { present: 40, absent: 3, late: 1, excused: 2 },
    }))).toBe('Submitted · 40 of 46 present');
  });

  it('says a cancelled class has no register to chase', () => {
    expect(progressOf(row({ session_status: 'cancelled' }))).toBe('Class cancelled');
  });
});

describe('why a register cannot be submitted', () => {
  it('nothing, when everybody is marked', () => {
    expect(submitBlockedReason(register())).toBeNull();
  });

  it('names how many are unaccounted for', () => {
    const reason = submitBlockedReason(register({
      summary: { present: 1, absent: 0, late: 0, excused: 0, marked: 1, unmarked: 1, total: 2 },
    }));
    expect(reason).toMatch(/1 student has no mark yet/);
  });

  it('uses the plural correctly, because this message is read constantly', () => {
    const reason = submitBlockedReason(register({
      summary: { present: 1, absent: 0, late: 0, excused: 0, marked: 1, unmarked: 3, total: 4 },
    }));
    expect(reason).toMatch(/3 students have no mark yet/);
  });

  it('says a submitted register is closed', () => {
    expect(submitBlockedReason(register({
      sheet: { status: 'submitted', version: 2, submitted_at: 'x', submitted_by: 'Asha Menon' },
    }))).toMatch(/has been submitted/);
  });

  it('says so when the reader holds no authority, which the server decides', () => {
    expect(submitBlockedReason(register({ can_submit: false }))).toMatch(/cannot submit/);
  });
});

describe('corrections belong to the student they changed', () => {
  const corrections: Correction[] = [
    {
      id: 'c1', record_id: 'rec1', student_name: 'Nisha Kumar',
      from_state: 'absent', to_state: 'present', reason: 'Paper register says present',
      corrected_by: 'Priya Sharma', corrected_at: '2026-06-03T10:00:00.000Z',
    },
    {
      id: 'c2', record_id: 'rec2', student_name: 'Ravi Nair',
      from_state: 'absent', to_state: 'excused', reason: 'NCC camp',
      corrected_by: 'Priya Sharma', corrected_at: '2026-06-03T10:05:00.000Z',
    },
  ];

  it('finds the ones for one mark', () => {
    const r = register({ corrections });
    expect(correctionsFor(r, 'rec1').map((c) => c.id)).toEqual(['c1']);
  });

  it('has none for a student nobody ever marked', () => {
    expect(correctionsFor(register({ corrections }), null)).toEqual([]);
  });
});

describe('filters', () => {
  const rows = [
    row({ session_id: 'a', status: 'draft', date: '2026-06-01' }),
    row({
      session_id: 'b', status: 'submitted', date: '2026-06-01',
      course: { code: 'CS302', title: 'Databases' },
      teacher: { id: 'p2', full_name: 'Ravi Shankar' },
    }),
    row({ session_id: 'c', status: 'draft', date: '2026-06-20', section: { id: 's2', label: 'B' } }),
  ];

  it('does nothing when nothing is set', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(filterOverview(rows, NO_FILTERS, '2026-06-10')).toHaveLength(3);
  });

  it('shows only what is owed', () => {
    expect(filterOverview(rows, { ...NO_FILTERS, outstandingOnly: true }, '2026-06-10')
      .map((r) => r.session_id)).toEqual(['a']);
  });

  it('narrows by register state', () => {
    expect(filterOverview(rows, { ...NO_FILTERS, status: 'submitted' }, '2026-06-10')
      .map((r) => r.session_id)).toEqual(['b']);
  });

  it('searches the course, the cohort and the teacher', () => {
    expect(filterOverview(rows, { ...NO_FILTERS, query: 'databases' }, '2026-06-10')
      .map((r) => r.session_id)).toEqual(['b']);
    expect(filterOverview(rows, { ...NO_FILTERS, query: 'shankar' }, '2026-06-10')
      .map((r) => r.session_id)).toEqual(['b']);
    expect(filterOverview(rows, { ...NO_FILTERS, query: 'b' }, '2026-06-10')
      .map((r) => r.session_id)).toEqual(['b', 'c']);
  });

  it('combines filters rather than falling back to everything', () => {
    expect(filterOverview(
      rows, { ...NO_FILTERS, outstandingOnly: true, status: 'submitted' }, '2026-06-10',
    )).toEqual([]);
  });
});

describe('a dense register still names what it shows', () => {
  it('keeps one letter per state for the row', () => {
    expect(STATE_LETTER.present).toBe('P');
    expect(STATE_LETTER.excused).toBe('E');
  });
});

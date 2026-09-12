import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS, STATUS_LABEL, filterStudents, initials, isFiltering, placementBlockedReason,
  unplacedCount, type Student,
} from './types.ts';

const student = (over: Partial<Student> = {}): Student => ({
  id: 's1', person_id: 'p1', full_name: 'Nisha Kumar', email: 'nisha@college.edu',
  enrolment_number: 'CSE2026-001',
  program: { id: 'prog1', name: 'B.Tech CSE' },
  admitted_on: '2026-06-01', status: 'enrolled', status_reason: null,
  section: { id: 'sec1', label: 'A', term_number: 5 },
  ...over,
});

describe('initials for an avatar', () => {
  it('takes the first and last name', () => {
    expect(initials('Nisha Kumar')).toBe('NK');
    expect(initials('Ravi Shankar Nair')).toBe('RN');
  });

  it('survives one name, extra spaces and nothing at all', () => {
    expect(initials('Meera')).toBe('M');
    expect(initials('  Asha   Menon  ')).toBe('AM');
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('students not yet in a cohort', () => {
  it('counts only those who could be placed', () => {
    const rows = [
      student({ id: 'a', section: null }),
      student({ id: 'b' }),
      // A withdrawn student without a cohort is not waiting to be placed.
      student({ id: 'c', section: null, status: 'withdrawn' }),
    ];
    expect(unplacedCount(rows)).toBe(1);
  });

  it('is zero when everybody enrolled has a cohort', () => {
    expect(unplacedCount([student(), student({ id: 'b' })])).toBe(0);
  });
});

describe('why a student cannot be placed', () => {
  it('says nothing about an enrolled student', () => {
    expect(placementBlockedReason(student())).toBeNull();
  });

  it('explains a withdrawal and names the way out', () => {
    const reason = placementBlockedReason(student({ status: 'withdrawn' }));
    expect(reason).toMatch(/withdrawn/);
    expect(reason).toMatch(/Reinstate/);
  });

  it('explains leave and graduation differently', () => {
    expect(placementBlockedReason(student({ status: 'on_leave' }))).toMatch(/on leave/);
    expect(placementBlockedReason(student({ status: 'graduated' }))).toMatch(/graduated/);
  });
});

describe('filters', () => {
  const rows = [
    student({ id: 'a' }),
    student({
      id: 'b', full_name: 'Ravi Nair', enrolment_number: 'CSE2026-002',
      email: 'ravi@college.edu', section: null,
    }),
    student({
      id: 'c', full_name: 'Meera Das', enrolment_number: 'BBA2026-001',
      email: 'meera@college.edu', program: { id: 'prog2', name: 'BBA' }, status: 'withdrawn',
    }),
  ];

  it('does nothing when nothing is set', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(filterStudents(rows, NO_FILTERS)).toHaveLength(3);
  });

  it('searches the name, the number and the email', () => {
    expect(filterStudents(rows, { ...NO_FILTERS, query: 'ravi' }).map((s) => s.id)).toEqual(['b']);
    expect(filterStudents(rows, { ...NO_FILTERS, query: 'bba2026' }).map((s) => s.id)).toEqual(['c']);
    expect(filterStudents(rows, { ...NO_FILTERS, query: 'nisha@' }).map((s) => s.id)).toEqual(['a']);
  });

  it('narrows to one program and one status', () => {
    expect(filterStudents(rows, { ...NO_FILTERS, programId: 'prog2' }).map((s) => s.id))
      .toEqual(['c']);
    expect(filterStudents(rows, { ...NO_FILTERS, status: 'withdrawn' }).map((s) => s.id))
      .toEqual(['c']);
  });

  it('shows only students waiting for a cohort', () => {
    expect(filterStudents(rows, { ...NO_FILTERS, unplacedOnly: true }).map((s) => s.id))
      .toEqual(['b']);
  });

  it('combines filters rather than falling back to everything', () => {
    expect(filterStudents(rows, { ...NO_FILTERS, programId: 'prog2', status: 'enrolled' }))
      .toEqual([]);
  });
});

describe('status labels read as a registrar would say them', () => {
  it('spells out on leave rather than the stored value', () => {
    expect(STATUS_LABEL.on_leave).toBe('On leave');
    expect(STATUS_LABEL.enrolled).toBe('Enrolled');
  });
});

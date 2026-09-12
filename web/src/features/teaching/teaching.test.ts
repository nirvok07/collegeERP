import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS, assignmentClosedReason, blockedReason, groupBySection, isFiltering,
  leadOf, unstaffedCount, visibleGroups,
  type Instructor, type Offering, type Section,
} from './types.ts';

const section = (over: Partial<Section> = {}): Section => ({
  id: 's1', label: 'A', status: 'active', term_number: 3, capacity: 60,
  cancelled_reason: null,
  program: { id: 'p1', name: 'B.Tech CSE', code: 'btech-cse' },
  department_name: 'Computer Science', campus_name: 'Main',
  academic_year: { id: 'y1', name: '2026-27' },
  term: { id: 't1', name: 'Odd' },
  allowed_transitions: ['completed', 'cancelled'],
  ...over,
});

const teacher = (over: Partial<Instructor> = {}): Instructor => ({
  assignment_id: 'a1', person_id: 'per1', full_name: 'Asha Menon',
  role: 'lead', since: '2026-07-01T00:00:00.000Z', ...over,
});

const offering = (over: Partial<Offering> = {}): Offering => ({
  id: 'o1', component: 'lecture', status: 'planned', cancelled_reason: null,
  course: { id: 'c1', code: 'CS301', title: 'Operating Systems' },
  section: { id: 's1', label: 'A', status: 'active', term_number: 3 },
  program: { id: 'p1', name: 'B.Tech CSE' },
  department_name: 'Computer Science',
  term: { id: 't1', name: 'Odd' }, academic_year_name: '2026-27',
  instructors: [teacher()], allowed_transitions: ['active', 'cancelled'],
  can_activate: true, ...over,
});

describe('why a course cannot start teaching', () => {
  it('says nothing when the course is ready', () => {
    expect(blockedReason(offering())).toBeNull();
  });

  it('names the cohort when the cohort has not started', () => {
    const reason = blockedReason(offering({
      section: { id: 's1', label: 'B', status: 'open', term_number: 3 },
    }));
    expect(reason).toMatch(/Section B is open/);
    expect(reason).toMatch(/not yet teaching/);
  });

  it('explains that attendance needs a teacher when nobody is assigned', () => {
    const reason = blockedReason(offering({ instructors: [], can_activate: false }));
    expect(reason).toMatch(/No instructor assigned/);
    expect(reason).toMatch(/Attendance is recorded against whoever is teaching/);
  });

  it('has nothing to explain once teaching has begun or ended', () => {
    expect(blockedReason(offering({ status: 'active' }))).toBeNull();
    expect(blockedReason(offering({ status: 'completed', instructors: [] }))).toBeNull();
  });
});

describe('the lead instructor', () => {
  it('is found among several assignees regardless of order', () => {
    const found = leadOf(offering({
      instructors: [
        teacher({ assignment_id: 'a2', person_id: 'per2', full_name: 'Ravi Nair', role: 'assistant' }),
        teacher({ assignment_id: 'a3', person_id: 'per3', full_name: 'Meera Das', role: 'lead' }),
      ],
    }));
    expect(found?.full_name).toBe('Meera Das');
  });

  it('is absent when only co-teachers are assigned', () => {
    expect(leadOf(offering({ instructors: [teacher({ role: 'co' })] }))).toBeUndefined();
  });
});

describe('assignment is closed once teaching is over', () => {
  it('is open while a course is planned or running', () => {
    expect(assignmentClosedReason(offering({ status: 'planned' }))).toBeNull();
    expect(assignmentClosedReason(offering({ status: 'active' }))).toBeNull();
  });

  it('explains that a finished course keeps the record it was taught with', () => {
    expect(assignmentClosedReason(offering({ status: 'completed' })))
      .toMatch(/stays as it was/);
    expect(assignmentClosedReason(offering({ status: 'cancelled' })))
      .toMatch(/cancelled/);
  });
});

describe('grouping courses under the cohort they are taught to', () => {
  it('keeps a cohort with no courses, because that is a state to act on', () => {
    const groups = groupBySection([section(), section({ id: 's2', label: 'B' })], [offering()]);
    expect(groups.map((g) => g.section.label)).toEqual(['A', 'B']);
    expect(groups[1]!.offerings).toEqual([]);
  });

  it('preserves the order the server sent the cohorts in', () => {
    const groups = groupBySection(
      [section({ id: 's2', label: 'B' }), section({ id: 's1', label: 'A' })],
      [offering({ id: 'o2', section: { id: 's2', label: 'B', status: 'active', term_number: 3 } }), offering()],
    );
    expect(groups.map((g) => g.section.label)).toEqual(['B', 'A']);
    expect(groups[0]!.offerings.map((o) => o.id)).toEqual(['o2']);
  });

  it('ignores an offering whose cohort is not in the list', () => {
    const groups = groupBySection([section()], [
      offering(),
      offering({ id: 'o9', section: { id: 'gone', label: 'Z', status: 'active', term_number: 1 } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.offerings.map((o) => o.id)).toEqual(['o1']);
  });
});

describe('filters', () => {
  const sections = [section(), section({ id: 's2', label: 'B', program: { id: 'p2', name: 'BBA', code: 'bba' } })];
  const offerings = [
    offering(),
    offering({
      id: 'o2', status: 'active', instructors: [],
      course: { id: 'c2', code: 'CS302', title: 'Databases' },
    }),
    offering({
      id: 'o3', instructors: [],
      course: { id: 'c3', code: 'BB101', title: 'Accounting' },
      section: { id: 's2', label: 'B', status: 'active', term_number: 3 },
      program: { id: 'p2', name: 'BBA' },
    }),
  ];

  it('shows every cohort, empty ones included, when nothing is filtered', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    const groups = visibleGroups(sections, offerings, NO_FILTERS);
    expect(groups).toHaveLength(2);
  });

  it('hides a cohort left with nothing by a search', () => {
    const groups = visibleGroups(sections, offerings, { ...NO_FILTERS, query: 'databases' });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.offerings.map((o) => o.id)).toEqual(['o2']);
  });

  it('searches instructors as well as courses, since both answer "who teaches what"', () => {
    const groups = visibleGroups(sections, offerings, { ...NO_FILTERS, query: 'asha' });
    expect(groups[0]!.offerings.map((o) => o.id)).toEqual(['o1']);
  });

  it('narrows to one program, cohorts of other programs included', () => {
    const groups = visibleGroups(sections, offerings, { ...NO_FILTERS, programId: 'p2' });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.section.label).toBe('B');
  });

  it('counts only courses that still expect to start as unstaffed', () => {
    // o2 has nobody assigned but is already running, so it is a different
    // problem and not something to fix before the term starts.
    expect(unstaffedCount(offerings)).toBe(1);
  });

  it('shows only the courses that will refuse to start', () => {
    const groups = visibleGroups(sections, offerings, { ...NO_FILTERS, unstaffedOnly: true });
    expect(groups.flatMap((g) => g.offerings).map((o) => o.id)).toEqual(['o3']);
  });

  it('combines a status filter with a program filter', () => {
    const groups = visibleGroups(sections, offerings, {
      ...NO_FILTERS, status: 'active', programId: 'p1',
    });
    expect(groups.flatMap((g) => g.offerings).map((o) => o.id)).toEqual(['o2']);
  });

  it('reports an empty result rather than falling back to everything', () => {
    expect(visibleGroups(sections, offerings, { ...NO_FILTERS, query: 'zzz' })).toEqual([]);
  });
});

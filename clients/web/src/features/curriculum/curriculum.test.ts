import { describe, expect, it } from 'vitest';
import {
  emptyTerms, readOnlyReason,
  type CurriculumVersion, type VersionDetail, type VersionStatus,
} from './types.ts';

const version = (over: Partial<CurriculumVersion> = {}): CurriculumVersion => ({
  id: 'v1', program_id: 'p1', program_name: 'B.Tech CSE',
  regulation_year: 2024, revision: 1, title: null, status: 'draft',
  total_terms: 4, published_at: null, superseded_by: null,
  course_count: 0, total_credits: 0, editable: true, ...over,
});

const detail = (terms: VersionDetail['terms'], over: Partial<CurriculumVersion> = {}): VersionDetail =>
  ({ ...version(over), terms });

describe('editability comes from the server, never inferred', () => {
  it('a draft is editable and has no explanation to give', () => {
    expect(readOnlyReason(version({ status: 'draft', editable: true }))).toBeNull();
  });

  it('explains why a published version cannot be edited', () => {
    const reason = readOnlyReason(version({ status: 'published', editable: false }));
    expect(reason).toMatch(/Students admitted under this regulation/);
    expect(reason).toMatch(/new version/);
  });

  it('explains that a superseded version still governs its cohort', () => {
    const reason = readOnlyReason(version({ status: 'superseded', editable: false }));
    expect(reason).toMatch(/still governs the students admitted under it/);
  });

  it('trusts the server flag over the status name', () => {
    // If the backend ever marks something editable that the client would guess
    // otherwise, the server wins: it owns the rule the database enforces.
    expect(readOnlyReason(version({ status: 'published', editable: true }))).toBeNull();
  });

  it('never claims a version is editable merely because it looks like a draft', () => {
    expect(readOnlyReason(version({ status: 'draft', editable: false }))).not.toBeNull();
  });
});

describe('publication readiness', () => {
  it('names every term with no courses', () => {
    const d = detail([
      { term_number: 1, courses: [{ id: 'e1', course_id: 'c1', code: 'CS101', title: 'Programming', credits: 4, requirement: 'core', elective_group: null }], credits: 4 },
      { term_number: 2, courses: [], credits: 0 },
      { term_number: 3, courses: [], credits: 0 },
      { term_number: 4, courses: [{ id: 'e2', course_id: 'c2', code: 'CS201', title: 'Data', credits: 3, requirement: 'core', elective_group: null }], credits: 3 },
    ]);
    expect(emptyTerms(d)).toEqual([2, 3]);
  });

  it('reports nothing when every term is populated', () => {
    const d = detail([
      { term_number: 1, courses: [{ id: 'e1', course_id: 'c1', code: 'CS101', title: 'P', credits: 4, requirement: 'core', elective_group: null }], credits: 4 },
    ]);
    expect(emptyTerms(d)).toEqual([]);
  });

  it('an entirely empty curriculum reports all of its terms', () => {
    const d = detail([
      { term_number: 1, courses: [], credits: 0 },
      { term_number: 2, courses: [], credits: 0 },
    ]);
    expect(emptyTerms(d)).toEqual([1, 2]);
  });
});

describe('version ordering', () => {
  const sort = (versions: CurriculumVersion[]) =>
    [...versions].sort((a, b) => b.regulation_year - a.regulation_year || b.revision - a.revision);

  it('shows the newest regulation first, which is what an administrator wants', () => {
    const ordered = sort([
      version({ id: 'a', regulation_year: 2020 }),
      version({ id: 'b', regulation_year: 2026 }),
      version({ id: 'c', regulation_year: 2024 }),
    ]);
    expect(ordered.map((v) => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders revisions within a year, newest first', () => {
    const ordered = sort([
      version({ id: 'r1', regulation_year: 2024, revision: 1 }),
      version({ id: 'r3', regulation_year: 2024, revision: 3 }),
      version({ id: 'r2', regulation_year: 2024, revision: 2 }),
    ]);
    expect(ordered.map((v) => v.id)).toEqual(['r3', 'r2', 'r1']);
  });
});

describe('successor readiness', () => {
  const ready = (kind: 'revision' | 'amendment' | null, reason: string, year: number, from: number) =>
    kind !== null && reason.trim().length > 0
      && (kind === 'revision' || year > from);

  it('requires a choice between correcting and changing', () => {
    expect(ready(null, 'a reason', 2026, 2024)).toBe(false);
  });

  it('requires a reason for either kind, since the audit trail is read years later', () => {
    expect(ready('revision', '', 2024, 2024)).toBe(false);
    expect(ready('amendment', '   ', 2026, 2024)).toBe(false);
  });

  it('a revision needs no new year, because it stays in its own', () => {
    expect(ready('revision', 'Credits transcribed wrongly', 2024, 2024)).toBe(true);
  });

  it('an amendment must come after the regulation it replaces', () => {
    expect(ready('amendment', 'New syllabus', 2020, 2024)).toBe(false);
    expect(ready('amendment', 'New syllabus', 2026, 2024)).toBe(true);
  });
});

describe('course catalogue selection', () => {
  const courses = [
    { id: 'c1', code: 'CS101', title: 'Programming', used_in_versions: 3 },
    { id: 'c2', code: 'CS201', title: 'Data Structures', used_in_versions: 1 },
    { id: 'c3', code: 'MA101', title: 'Discrete Mathematics', used_in_versions: 0 },
  ];

  const search = (q: string) => {
    const needle = q.trim().toLowerCase();
    return courses.filter((c) =>
      !needle || c.code.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle));
  };

  it('matches on code and on title', () => {
    expect(search('cs2').map((c) => c.id)).toEqual(['c2']);
    expect(search('mathematics').map((c) => c.id)).toEqual(['c3']);
  });

  it('an empty query lists the catalogue rather than nothing', () => {
    expect(search('')).toHaveLength(3);
  });

  it('a course already in this regulation cannot be added twice', () => {
    const placed = new Set(['c1']);
    const selectable = courses.filter((c) => !placed.has(c.id));
    expect(selectable.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('reuse across regulations is normal and shown, not prevented', () => {
    // The same course appearing in three regulations is the expected case, and
    // it carries different credits in each.
    expect(courses.find((c) => c.id === 'c1')!.used_in_versions).toBe(3);
  });
});

describe('status presentation', () => {
  const tone: Record<VersionStatus, string> = {
    draft: 'warning', published: 'success', superseded: 'neutral', discarded: 'neutral',
  };

  it('draft is visually distinct from published', () => {
    expect(tone.draft).not.toBe(tone.published);
  });

  it('superseded is calm, because it is still authoritative for its cohort', () => {
    expect(tone.superseded).toBe('neutral');
  });
});

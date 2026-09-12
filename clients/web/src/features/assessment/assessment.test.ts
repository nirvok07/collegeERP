import { describe, expect, it } from 'vitest';
import {
  parseScore, progressOf, resultLabel, submitBlockedReason, weightLeft,
  type AssessmentComponent, type Sheet,
} from './types.ts';

const component = (over: Partial<AssessmentComponent> = {}): AssessmentComponent => ({
  id: 'a1', offering_id: 'o1', name: 'Test 1', kind: 'test', max_marks: 50, weight: 20,
  held_on: '2026-06-10', status: 'draft', submitted_at: null, submitted_by: null,
  verified_at: null, verified_by: null, cancelled_reason: null, version: 3, mark_count: 0,
  course: { code: 'CS301', title: 'Operating Systems' }, section: { id: 's1', label: 'A' },
  program_name: 'B.Tech CSE', term: { id: 't1', name: 'Semester 1' }, teacher: 'Asha Menon',
  ...over,
});

const sheet = (over: Partial<Sheet> = {}): Sheet => ({
  component: component(), needs_date: false, students: [], corrections: [],
  summary: { scored: 2, absent: 0, exempt: 0, marked: 2, unmarked: 0, total: 2 },
  can_plan: true, can_mark: true, can_submit: true, can_verify: false, can_correct: false,
  ...over,
});

describe('reading a score someone typed', () => {
  it('accepts whole and half marks up to the maximum', () => {
    expect(parseScore('42', 50)).toEqual({ ok: true, value: 42 });
    expect(parseScore('37.5', 50)).toEqual({ ok: true, value: 37.5 });
    expect(parseScore('0', 50)).toEqual({ ok: true, value: 0 });
    expect(parseScore(' 50 ', 50)).toEqual({ ok: true, value: 50 });
  });

  it('refuses anything over the maximum, and says what it is out of', () => {
    expect(parseScore('51', 50)).toEqual({ ok: false, error: 'Out of 50' });
  });

  it('refuses thirds, negatives and text', () => {
    expect(parseScore('10.333', 50).ok).toBe(false);
    expect(parseScore('-1', 50).ok).toBe(false);
    expect(parseScore('ten', 50).ok).toBe(false);
  });

  it('treats an empty field as a missing result, not as zero', () => {
    const r = parseScore('', 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/absent or exempt/);
  });
});

describe('a result as a reader would say it', () => {
  it('keeps absent, exempt and not entered distinct from zero', () => {
    expect(resultLabel('scored', 0)).toBe('0');
    expect(resultLabel('absent', null)).toBe('Absent');
    expect(resultLabel('exempt', null)).toBe('Exempt');
    expect(resultLabel(null, null)).toBe('Not entered');
  });
});

describe('why a sheet cannot be submitted', () => {
  it('nothing, when everybody has a result and all is saved', () => {
    expect(submitBlockedReason(sheet(), 0)).toBeNull();
  });

  it('asks for the date first, because the class list depends on it', () => {
    expect(submitBlockedReason(sheet({ needs_date: true }), 0)).toMatch(/when this assessment was held/);
  });

  it('counts unsaved changes before anything else the reader can fix', () => {
    expect(submitBlockedReason(sheet(), 3)).toMatch(/3 unsaved changes/);
    expect(submitBlockedReason(sheet(), 1)).toMatch(/1 unsaved change first/);
  });

  it('names how many students have no result', () => {
    const reason = submitBlockedReason(sheet({
      summary: { scored: 1, absent: 0, exempt: 0, marked: 1, unmarked: 2, total: 3 },
    }), 0);
    expect(reason).toMatch(/2 students have no result yet/);
  });

  it('says so when the sheet is already closed', () => {
    expect(submitBlockedReason(sheet({ component: component({ status: 'submitted' }) }), 0))
      .toMatch(/awaiting verification/);
  });

  it('says so when the reader holds no authority, which the server decides', () => {
    expect(submitBlockedReason(sheet({ can_submit: false }), 0)).toMatch(/cannot submit/);
  });
});

describe('how far along a component is', () => {
  it('reads the stage in words', () => {
    expect(progressOf(component({ held_on: null }))).toBe('Not held yet');
    expect(progressOf(component({ mark_count: 0 }))).toBe('Held 2026-06-10, nothing entered');
    expect(progressOf(component({ mark_count: 12 }))).toBe('12 entered');
    expect(progressOf(component({ status: 'submitted', submitted_by: 'Asha Menon' })))
      .toBe('Submitted by Asha Menon');
    expect(progressOf(component({ status: 'verified', verified_by: 'Rajan Iyer' })))
      .toBe('Verified by Rajan Iyer');
    expect(progressOf(component({ status: 'cancelled' }))).toBe('Cancelled');
  });
});

describe('weight left to allocate', () => {
  it('rounds as the server does and never goes negative', () => {
    expect(weightLeft(30)).toBe(70);
    expect(weightLeft(33.33 + 33.33)).toBe(33.34);
    expect(weightLeft(100)).toBe(0);
    expect(weightLeft(120)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../../lib/api.ts';
import { dashboardTileKeys } from './DashboardPage.tsx';
import { loadCourses, loadOverview, loadWeek } from './dashboardData.ts';

describe('dashboard module grid (WID-2)', () => {
  it('shows the people/organisation/curriculum tiles only with person.read', () => {
    expect(dashboardTileKeys(new Set(['person.read']))).toEqual(['people', 'organisation', 'curriculum']);
  });

  it('adds the college tile with institution.read', () => {
    expect(dashboardTileKeys(new Set(['person.read', 'institution.read']))).toContain('college');
  });

  it('shows no tiles when the actor has no permission', () => {
    expect(dashboardTileKeys(new Set())).toEqual([]);
    expect(dashboardTileKeys(null)).toEqual([]);
  });

  it('puts a teacher into timetable and assessment when their perms allow', () => {
    const keys = dashboardTileKeys(new Set(['session.read', 'assessment.verify']));
    expect(keys).toContain('timetable');
    expect(keys).toContain('assessment');
  });
});

describe('dashboard data reads', () => {
  function client(handler: (path: string) => unknown): ApiClient {
    return {
      get: async () => handler('get'),
      post: async () => handler('post'),
      patch: async () => handler('patch'),
      put: async () => handler('put'),
      del: async () => handler('del'),
    } as unknown as ApiClient;
  }

  it('loadOverview maps the server envelope 1:1', async () => {
    const api = client(() => ({ ok: true, value: { staff: 4, students: 120, departments: 3 } }));
    expect(await loadOverview(api)).toEqual({ staff: 4, students: 120, departments: 3 });
  });

  it('loadCourses maps offerings to course cards', async () => {
    const api = client(() => ({
      ok: true,
      value: [{ id: 'o1', course: { code: 'CS101', title: 'Intro' }, program: { name: 'B.Tech' } }],
    }));
    expect(await loadCourses(api)).toEqual([{ id: 'o1', code: 'CS101', title: 'Intro', programme: 'B.Tech' }]);
  });

  it('loadWeek sorts today by start time', async () => {
    const api = client(() => ({
      ok: true,
      value: [
        { starts_at: '2026-09-16T12:00:00Z', course: { code: 'B', title: 'Later' } },
        { starts_at: '2026-09-16T09:00:00Z', course: { code: 'A', title: 'First' } },
      ],
    }));
    const week = await loadWeek(api);
    expect(week?.today.map((c) => c.code)).toEqual(['A', 'B']);
  });
});
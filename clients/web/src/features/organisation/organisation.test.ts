import { describe, expect, it } from 'vitest';
import { buildTree, type Campus, type Department } from './types.ts';

const campus = (over: Partial<Campus> = {}): Campus => ({
  id: 'c1', name: 'Main Campus', code: 'main', is_default: true,
  status: 'active', department_count: 0, ...over,
});

const department = (over: Partial<Department> = {}): Department => ({
  id: 'd1', name: 'Computer Science', code: 'cse', status: 'active',
  campus_id: 'c1', campus_name: 'Main Campus', ...over,
});

describe('organisation tree', () => {
  it('nests departments under their campus', () => {
    const tree = buildTree(
      [campus(), campus({ id: 'c2', name: 'North', code: 'north', is_default: false })],
      [
        department({ id: 'd1', campus_id: 'c1' }),
        department({ id: 'd2', campus_id: 'c2', name: 'Physics', code: 'phy' }),
        department({ id: 'd3', campus_id: 'c1', name: 'Civil', code: 'civil' }),
      ],
    );
    expect(tree).toHaveLength(2);
    expect(tree[0]!.departments.map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(tree[1]!.departments.map((d) => d.id)).toEqual(['d2']);
  });

  it('keeps a campus with no departments, rather than dropping it', () => {
    const tree = buildTree([campus()], []);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.departments).toEqual([]);
  });

  it('ignores a department whose campus is absent from the list', () => {
    // Happens when archived campuses are hidden but their departments are not.
    const tree = buildTree([campus()], [department({ campus_id: 'gone' })]);
    expect(tree[0]!.departments).toEqual([]);
  });

  it('builds in one pass rather than scanning per campus', () => {
    const campuses = Array.from({ length: 50 }, (_, i) => campus({ id: `c${i}`, is_default: i === 0 }));
    const departments = Array.from({ length: 2000 }, (_, i) =>
      department({ id: `d${i}`, campus_id: `c${i % 50}` }));
    const started = performance.now();
    const tree = buildTree(campuses, departments);
    expect(performance.now() - started).toBeLessThan(50);
    expect(tree.reduce((n, node) => n + node.departments.length, 0)).toBe(2000);
  });
});

describe('scope selection rules', () => {
  const roles = [
    { key: 'college_admin', allowed_scope_types: ['institution'] },
    { key: 'department_head', allowed_scope_types: ['department'] },
    { key: 'faculty', allowed_scope_types: ['department', 'section'] },
    { key: 'exam_officer', allowed_scope_types: ['section'] },
  ];

  const grantable = (held: string[], departmentCount: number) => {
    const set = new Set(held);
    return roles.filter((r) => {
      if (r.allowed_scope_types.includes('institution')) return !set.has(`${r.key}:institution`);
      return r.allowed_scope_types.includes('department') && departmentCount > 0;
    }).map((r) => r.key);
  };

  it('offers department roles once departments exist', () => {
    expect(grantable([], 3)).toEqual(['college_admin', 'department_head', 'faculty']);
  });

  it('hides department roles while no department exists, rather than showing an empty picker', () => {
    expect(grantable([], 0)).toEqual(['college_admin']);
  });

  it('never offers a role whose only scope the tree cannot yet express', () => {
    // Section scope belongs to a module that does not exist. It stays out in
    // both cases rather than appearing with nothing to select.
    expect(grantable([], 5)).not.toContain('exam_officer');
  });

  it('allows the same department role twice, in different departments', () => {
    expect(grantable(['department_head:d1'], 2)).toContain('department_head');
  });

  it('does not re-offer an institution role already held', () => {
    expect(grantable(['college_admin:institution'], 2)).not.toContain('college_admin');
  });
});

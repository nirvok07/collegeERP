import { describe, expect, it } from 'vitest';
import type { Person, Role } from './types.ts';

/**
 * The navigation rule that matters: sections are absent, never disabled, and
 * they follow the server's permission set rather than the actor's kind.
 */
function sectionKeys(permissions: string[]): string[] {
  const set = new Set(permissions);
  const items: string[] = [];
  if (set.has('person.read')) items.push('people');
  return items.length === 0 ? ['none'] : items;
}

const person = (over: Partial<Person> = {}): Person => ({
  person_id: 'p1', full_name: 'Ravi Kumar', email: 'ravi@hill.edu',
  person_type: 'staff', account_status: 'active', last_login_at: null,
  role_keys: [], ...over,
});

const roles: Role[] = [
  { key: 'college_admin', name: 'College Administrator', allowed_scope_types: ['institution'], permission_count: 11, summary: 'Can grant and remove access' },
  { key: 'faculty', name: 'Faculty', allowed_scope_types: ['department', 'section'], permission_count: 1, summary: 'Can view people' },
];

describe('section visibility', () => {
  it('shows People only when the server grants person.read', () => {
    expect(sectionKeys(['person.read', 'account.manage'])).toEqual(['people']);
  });

  it('falls back to a designed no-access section, not an error', () => {
    expect(sectionKeys([])).toEqual(['none']);
  });

  it('does not infer access from having an account', () => {
    expect(sectionKeys(['institution.read'])).toEqual(['none']);
  });
});

describe('people filtering', () => {
  const rows = [
    person({ person_id: 'p1', full_name: 'Ravi Kumar', email: 'ravi@hill.edu', person_type: 'staff' }),
    person({ person_id: 'p2', full_name: 'Meena Iyer', email: 'meena@hill.edu', person_type: 'student' }),
    person({ person_id: 'p3', full_name: 'Asha Rao', email: null, person_type: 'staff' }),
  ];

  const filter = (query: string, type: 'all' | 'staff' | 'student') => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== 'all' && r.person_type !== type) return false;
      if (!q) return true;
      return r.full_name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q);
    });
  };

  it('matches on name and on email', () => {
    expect(filter('ravi', 'all').map((r) => r.person_id)).toEqual(['p1']);
    expect(filter('meena@hill', 'all').map((r) => r.person_id)).toEqual(['p2']);
  });

  it('does not break on a person with no email', () => {
    expect(() => filter('asha', 'all')).not.toThrow();
    expect(filter('asha', 'all').map((r) => r.person_id)).toEqual(['p3']);
  });

  it('combines type with search', () => {
    expect(filter('', 'staff').map((r) => r.person_id)).toEqual(['p1', 'p3']);
    expect(filter('a', 'student').map((r) => r.person_id)).toEqual(['p2']);
  });
});

describe('grantable roles', () => {
  const grantable = (held: string[]) => {
    const set = new Set(held);
    return roles.filter((r) => r.allowed_scope_types.includes('institution') && !set.has(r.key));
  };

  it('offers only roles valid at college level', () => {
    // Faculty is department-scoped, so it needs a scope picker that does not
    // exist until the academic structure module owns those scopes.
    expect(grantable([]).map((r) => r.key)).toEqual(['college_admin']);
  });

  it('does not offer a role the person already holds', () => {
    expect(grantable(['college_admin'])).toEqual([]);
  });
});

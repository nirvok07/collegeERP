export interface Campus {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
  status: 'active' | 'archived';
  department_count: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'archived';
  campus_id: string;
  campus_name: string;
}

/** The shape both clients consume: a campus with its departments nested. */
export interface OrgNode {
  campus: Campus;
  departments: Department[];
}

/**
 * Builds the tree from two flat lists.
 *
 * Kept as a pure function rather than a server shape, so the API stays flat and
 * paginable and each client arranges it the way its own layout needs. The web
 * console nests; a phone will likely drill down one level at a time.
 */
export function buildTree(campuses: Campus[], departments: Department[]): OrgNode[] {
  const byCampus = new Map<string, Department[]>();
  for (const department of departments) {
    const list = byCampus.get(department.campus_id);
    if (list) list.push(department);
    else byCampus.set(department.campus_id, [department]);
  }
  return campuses.map((campus) => ({
    campus,
    departments: byCampus.get(campus.id) ?? [],
  }));
}

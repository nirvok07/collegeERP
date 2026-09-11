-- 002_seed_platform_reference.sql
-- Permissions and system role templates are platform-owned reference data (M1 section 7).
-- A tenant composes roles from these; it does not invent permissions, because an
-- invented permission enforces nothing.

INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('institution.read',        'M2', 'View institution profile',      'normal',    false, true),
  ('institution.manage',      'M2', 'Edit institution settings',     'sensitive', false, true),
  ('campus.manage',           'M2', 'Manage campuses',               'normal',    false, true),
  ('department.manage',       'M2', 'Manage departments',            'normal',    false, true),
  ('person.read',             'M1', 'View people',                   'normal',    false, true),
  ('person.manage',           'M1', 'Create and edit people',        'sensitive', false, true),
  ('person.export',           'M1', 'Export personal data',          'critical',  true,  false),
  ('account.manage',          'M1', 'Invite and deactivate accounts','sensitive', false, true),
  ('role.assign',             'M1', 'Grant and revoke authority',    'critical',  true,  false),
  ('role.define',             'M1', 'Create and edit roles',         'critical',  true,  false),
  ('audit.read',              'M1', 'Read the audit trail',          'sensitive', false, true)
ON CONFLICT (key) DO NOTHING;

-- College Administrator: full authority inside exactly one institution.
-- This is the role granted by the bootstrap in W0.
INSERT INTO role_definitions
  (id, tenant_id, key, name, permission_keys, allowed_scope_types, requires_approval, is_system)
VALUES (
  '11111111-1111-4111-8111-111111111111', NULL, 'college_admin', 'College Administrator',
  ARRAY['institution.read','institution.manage','campus.manage','department.manage',
        'person.read','person.manage','person.export','account.manage',
        'role.assign','role.define','audit.read'],
  ARRAY['institution'], false, true
),
(
  '22222222-2222-4222-8222-222222222222', NULL, 'department_head', 'Head of Department',
  ARRAY['person.read','account.manage','role.assign','audit.read'],
  ARRAY['department'], false, true
),
(
  '33333333-3333-4333-8333-333333333333', NULL, 'faculty', 'Faculty',
  ARRAY['person.read'],
  ARRAY['department','section'], false, true
)
ON CONFLICT DO NOTHING;

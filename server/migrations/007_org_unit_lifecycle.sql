-- 007_org_unit_lifecycle.sql
--
-- Campuses and departments exist since 001 but have no lifecycle. A college
-- reorganises: departments merge, close, get renamed. Without a lifecycle the
-- only way to remove one is a hard delete, which would break every role
-- assignment scoped to it and every historical record that references it.
--
-- `status` rather than `deleted_at`: archiving a department is a real
-- administrative state a user sees and can reverse, not a tombstone. The row
-- keeps propagating to clients, which is what AD-8 actually requires.

ALTER TABLE campuses
  ADD COLUMN status      text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','archived')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES persons(id);

ALTER TABLE departments
  ADD COLUMN status      text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','archived')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES persons(id);

-- Codes are unique among ACTIVE units only, so a code freed by archiving can be
-- reused. The existing unique constraints spanned every row, which would have
-- made a code unusable forever after one archival.
ALTER TABLE campuses DROP CONSTRAINT IF EXISTS campuses_tenant_id_code_key;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_tenant_id_code_key;

CREATE UNIQUE INDEX campuses_active_code_uq
  ON campuses (tenant_id, code) WHERE status = 'active';
CREATE UNIQUE INDEX departments_active_code_uq
  ON departments (tenant_id, code) WHERE status = 'active';

-- The hot path for scope resolution: given a department, find its campus.
CREATE INDEX departments_campus_idx ON departments (campus_id) WHERE status = 'active';

-- Exactly one default campus per institution. Provisioning creates it; nothing
-- may create a second, because "the default" would then be ambiguous.
CREATE UNIQUE INDEX campuses_one_default_uq
  ON campuses (tenant_id) WHERE is_default AND status = 'active';

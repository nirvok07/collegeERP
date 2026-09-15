-- 031_fee_structures.sql
--
-- M11 Student Finance, FEE-1: fee heads and structures. See
-- docs/blueprint/modules/m11-student-finance.md for the module contract
-- (roles, ledger invariants, approval shape) this and later FEE migrations
-- build against.
--
-- NOT built here, and deliberately: invoices, payments, receipts, concessions,
-- fines, waivers. Those are FEE-2 through FEE-5. This migration only lets the
-- Accountant define what a program's students owe, per academic year.

-- ---------------------------------------------------------------------------
-- A fee head: what the money is for (Tuition, Exam, Lab, Hostel, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE fee_heads (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  code        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX fee_heads_code_uq ON fee_heads (tenant_id, code);

-- ---------------------------------------------------------------------------
-- A fee structure: what one program's students owe for one academic year.
-- Draft while the Accountant is composing it; published makes it what FEE-2
-- generates invoices from. One structure per program per year in force at a
-- time (§4 of the module doc: never a second structure for one student).
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structures (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  program_id       uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'superseded', 'discarded')),
  published_at     timestamptz,
  published_by     uuid REFERENCES persons(id),
  superseded_by    uuid REFERENCES fee_structures(id),
  superseded_at    timestamptz,
  discarded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1,

  CONSTRAINT fee_structure_published_has_provenance
    CHECK (status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL))
);

-- One published (or superseded-pending) structure per program per year.
CREATE UNIQUE INDEX fee_structures_identity_uq
  ON fee_structures (program_id, academic_year_id)
  WHERE status IN ('draft', 'published');

CREATE INDEX fee_structures_program_idx ON fee_structures (program_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- An instalment of a structure: when a slice of the year's fee falls due, and
-- the flat late fee (§3, §5 of the module doc) charged once it is overdue.
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structure_instalments (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  structure_id    uuid NOT NULL REFERENCES fee_structures(id) ON DELETE RESTRICT,
  seq             int NOT NULL CHECK (seq > 0),
  due_date        date NOT NULL,
  -- NULL: this instalment carries no late fee.
  late_fee_paise  bigint CHECK (late_fee_paise IS NULL OR late_fee_paise > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX fee_structure_instalments_seq_uq ON fee_structure_instalments (structure_id, seq);
CREATE INDEX fee_structure_instalments_structure_idx ON fee_structure_instalments (structure_id);

-- ---------------------------------------------------------------------------
-- One fee head's amount within one instalment. A structure's total is the
-- sum of its instalments' lines; there is no separately stored total, so it
-- can never drift from what the lines actually say.
-- ---------------------------------------------------------------------------
CREATE TABLE fee_structure_lines (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  instalment_id   uuid NOT NULL REFERENCES fee_structure_instalments(id) ON DELETE RESTRICT,
  fee_head_id     uuid NOT NULL REFERENCES fee_heads(id) ON DELETE RESTRICT,
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX fee_structure_lines_head_uq ON fee_structure_lines (instalment_id, fee_head_id);
CREATE INDEX fee_structure_lines_instalment_idx ON fee_structure_lines (instalment_id);

-- ---------------------------------------------------------------------------
-- Isolation, privileges: the same tenant_isolation pattern as every other
-- tenant-owned table (014_student_records.sql).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_heads', 'fee_structures', 'fee_structure_instalments', 'fee_structure_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    -- No DELETE: §3 of the module doc, append-only; a head is archived, a
    -- structure discarded, never removed.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', t, app_role);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Permissions and roles (§2 of the module doc). Same NO FORCE / FORCE
-- pattern as 002, 011, 012, 013, 014: platform templates carry no tenant.
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, module, label, sensitivity, requires_mfa, delegable) VALUES
  ('fee.read',    'M11', 'View fees, invoices and dues',                 'normal',    false, true),
  ('fee.manage',  'M11', 'Manage fee heads, structures, fines',          'sensitive', false, true),
  ('fee.collect',  'M11', 'Record payments and issue receipts',           'sensitive', false, true),
  ('fee.approve', 'M11', 'Approve concessions and waivers',              'sensitive', false, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE role_definitions NO FORCE ROW LEVEL SECURITY;

INSERT INTO role_definitions
  (id, tenant_id, key, name, permission_keys, allowed_scope_types, requires_approval, is_system)
VALUES (
  '66666666-6666-4666-8666-666666666666', NULL, 'accountant', 'Accountant',
  ARRAY['fee.read', 'fee.manage'],
  ARRAY['institution'], false, true
),
(
  '77777777-7777-4777-8777-777777777777', NULL, 'cashier', 'Cashier',
  ARRAY['fee.read', 'fee.collect'],
  ARRAY['institution'], false, true
)
ON CONFLICT DO NOTHING;

-- The College Admin already holds every college-wide capability; fees are
-- no exception (same move as 014's student.* grant to college_admin).
UPDATE role_definitions
   SET permission_keys = permission_keys || ARRAY['fee.read', 'fee.manage', 'fee.collect', 'fee.approve']
 WHERE key = 'college_admin' AND tenant_id IS NULL;

ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;

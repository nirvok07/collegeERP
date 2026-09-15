-- 032_fee_invoices.sql
--
-- M11 Student Finance, FEE-2: invoices generated from a published fee
-- structure. One invoice per student per instalment. Per the module doc
-- (§4), a fee structure is program + academic year only, so generating
-- invoices for a structure invoices every currently enrolled student of
-- that program, regardless of which year of study they are in; a
-- student-specific difference is a concession (FEE-3), never a second
-- structure.
--
-- NOT built here: payments, receipts, concessions. An invoice's status
-- moves only between 'due' and 'cancelled' until FEE-4 introduces payment
-- allocation; this is a receivable, not the money ledger itself, so it is
-- not held to the ledger's append-only rule the way a payment or receipt is.

CREATE TABLE invoices (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id        uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  fee_structure_id  uuid NOT NULL REFERENCES fee_structures(id) ON DELETE RESTRICT,
  instalment_id     uuid NOT NULL REFERENCES fee_structure_instalments(id) ON DELETE RESTRICT,
  -- Zero is reachable: a concession or waiver (FEE-3/FEE-5) can reduce this
  -- to nothing owed, at which point the invoice is marked paid.
  amount_paise      bigint NOT NULL CHECK (amount_paise >= 0),
  due_date          date NOT NULL,
  status            text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'cancelled')),
  generated_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1
);

-- Regenerating for a structure never duplicates a student's instalment.
CREATE UNIQUE INDEX invoices_student_instalment_uq ON invoices (student_id, instalment_id);
CREATE INDEX invoices_student_idx ON invoices (student_id, due_date);
CREATE INDEX invoices_structure_idx ON invoices (fee_structure_id);

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON invoices
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE invoices FROM PUBLIC;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON invoices TO %I', app_role);
END $$;

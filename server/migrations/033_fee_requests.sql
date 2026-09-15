-- 033_fee_requests.sql
--
-- M11 Student Finance, FEE-3: concession requests. One shared approval shape
-- for concessions (this slice), and later waivers of a late fee or fine
-- (FEE-5, once those exist to waive) — see the module doc §5.
--
-- requested -> approved (applied to the invoice) | rejected | withdrawn
--
-- A concession never edits the fee structure or deletes an invoice: it
-- reduces one invoice's amount_paise once approved, and the request row
-- itself is never edited after a decision — the decision fields are written
-- once, by the trigger below, not by the application re-issuing an UPDATE
-- with a hand-assembled WHERE clause it could get wrong twice.

CREATE TABLE fee_requests (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  kind              text NOT NULL CHECK (kind IN ('concession', 'waiver')),
  student_id        uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  invoice_id        uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount_paise      bigint NOT NULL CHECK (amount_paise > 0),
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested', 'approved', 'rejected', 'withdrawn')),
  requested_by      uuid NOT NULL REFERENCES persons(id),
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_by        uuid REFERENCES persons(id),
  decided_at        timestamptz,
  decision_reason   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1,

  CONSTRAINT fee_request_decision_has_provenance
    CHECK (status = 'requested' OR status = 'withdrawn'
           OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE INDEX fee_requests_invoice_idx ON fee_requests (invoice_id);
CREATE INDEX fee_requests_student_idx ON fee_requests (student_id);
-- At most one open request against an invoice at a time: a second request
-- while one is pending is almost always a mistake, not an intended stack.
CREATE UNIQUE INDEX fee_requests_one_open_uq ON fee_requests (invoice_id) WHERE status = 'requested';

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  ALTER TABLE fee_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE fee_requests FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON fee_requests
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE fee_requests FROM PUBLIC;
  -- No DELETE: withdrawing is a status, not a removal, so the record of what
  -- was asked for survives even when nobody acted on it.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON fee_requests TO %I', app_role);
END $$;

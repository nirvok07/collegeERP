-- 034_fee_payments.sql
--
-- M11 Student Finance, FEE-4: counter payments, allocation, receipts.
-- This is the money ledger the module doc's §3 invariants are actually
-- about: `payments` is append-only (INSERT+SELECT only, no UPDATE grant —
-- the same enforcement `audit_events` uses), a mistake is corrected by a
-- reversal row that references what it reverses, and receipt numbers are
-- assigned gaplessly per college at the moment a receipt is actually issued.
--
-- v1 boundary (not built here): a payment may not exceed a student's total
-- current dues — there is no advance/credit balance concept yet. Online
-- payment (FEE-7) is blocked on Razorpay credentials; this is counter-only.

-- ---------------------------------------------------------------------------
-- Gapless receipt numbers per college. A number is taken only when a receipt
-- is actually issued (never pre-allocated), so an aborted attempt leaves no
-- hole. The UPDATE...RETURNING inside one transaction is what makes this
-- safe under concurrent Cashiers: two requests serialize on this row.
-- ---------------------------------------------------------------------------
CREATE TABLE fee_receipt_counters (
  tenant_id    uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE RESTRICT,
  next_number  bigint NOT NULL DEFAULT 1 CHECK (next_number > 0)
);

-- ---------------------------------------------------------------------------
-- A payment. Never updated after insert: a mistake is corrected by inserting
-- a 'reversal' payment that names what it reverses and why, never by editing
-- this row. amount_paise is always positive; a reversal's sign is implied by
-- its kind, not stored as a negative number, so a stray SUM(amount_paise)
-- cannot silently net two rows that were never meant to cancel out.
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id          uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  kind                text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment', 'reversal')),
  method              text NOT NULL CHECK (method IN ('cash', 'upi', 'cheque', 'bank_transfer')),
  amount_paise        bigint NOT NULL CHECK (amount_paise > 0),
  -- A cheque number or bank/UPI reference. Optional: cash carries none.
  reference           text,
  reverses_payment_id uuid REFERENCES payments(id),
  reason              text,
  received_by         uuid NOT NULL REFERENCES persons(id),
  received_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  version             int NOT NULL DEFAULT 1,

  CONSTRAINT payment_reversal_is_explained
    CHECK (kind = 'payment' OR (reverses_payment_id IS NOT NULL AND reason IS NOT NULL))
);
CREATE INDEX payments_student_idx ON payments (student_id, received_at);
-- A payment is reversed at most once.
CREATE UNIQUE INDEX payments_reverses_uq ON payments (reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- How a payment (or its reversal) is split across the student's invoices,
-- oldest due date first. Also append-only: an allocation is never edited or
-- removed, only offset by a reversal's own allocations.
-- ---------------------------------------------------------------------------
CREATE TABLE payment_allocations (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  payment_id    uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount_paise  bigint NOT NULL CHECK (amount_paise > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_allocations_payment_idx ON payment_allocations (payment_id);
CREATE INDEX payment_allocations_invoice_idx ON payment_allocations (invoice_id);

-- ---------------------------------------------------------------------------
-- A receipt: the artifact handed to the student. The row is never deleted
-- when cancelled (module doc §3) — its status changes, and its number is
-- never reissued. A reversal payment gets no receipt of its own: it is an
-- internal correction to the ledger, not something to hand a student.
-- ---------------------------------------------------------------------------
CREATE TABLE receipts (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  payment_id            uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  receipt_number        bigint NOT NULL,
  status                text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  issued_at             timestamptz NOT NULL DEFAULT now(),
  cancelled_at          timestamptz,
  cancelled_by          uuid REFERENCES persons(id),
  cancellation_reason   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               int NOT NULL DEFAULT 1,

  CONSTRAINT receipt_cancellation_has_provenance
    CHECK (status = 'issued' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL))
);
CREATE UNIQUE INDEX receipts_payment_uq ON receipts (payment_id);
CREATE UNIQUE INDEX receipts_number_uq ON receipts (tenant_id, receipt_number);

DO $$
DECLARE
  t text;
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_receipt_counters', 'payments', 'payment_allocations', 'receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
  END LOOP;

  -- fee_receipt_counters has no tenant-nullable rows and no other tenant
  -- column shape to speak of; the same isolation predicate as everywhere else.
  CREATE POLICY tenant_isolation ON fee_receipt_counters
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON fee_receipt_counters TO %I', app_role);

  CREATE POLICY tenant_isolation ON payments
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  -- No UPDATE: append-only, enforced the same way as audit_events.
  EXECUTE format('GRANT SELECT, INSERT ON payments TO %I', app_role);

  CREATE POLICY tenant_isolation ON payment_allocations
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  EXECUTE format('GRANT SELECT, INSERT ON payment_allocations TO %I', app_role);

  CREATE POLICY tenant_isolation ON receipts
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  -- A receipt's status does change (issued -> cancelled), unlike the ledger
  -- rows above.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON receipts TO %I', app_role);
END $$;

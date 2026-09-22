-- 037_fee_online_payments.sql
--
-- M11 Student Finance, FEE-7: online payment, with a dummy gateway.
--
-- The owner has no Razorpay merchant account or API keys yet and asked to
-- move ahead with a dummy provider so the flow is built and testable now;
-- swapping in the real gateway later is an adapter change (see
-- server/src/modules/fees/application/online-gateway.ts), not a schema one.
-- Module doc §6 shape unchanged: the app opens a hosted checkout page and the
-- payment is recorded only from a "webhook" call the app never triggers
-- itself — here, our own dummy checkout page's own POST stands in for that
-- signed webhook, in place of Razorpay's.

-- `online` joins the existing counter methods. Nobody at the college
-- "receives" an online payment personally, so received_by is null for it —
-- exactly when the method is online, never otherwise.
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'upi', 'cheque', 'bank_transfer', 'online'));
ALTER TABLE payments ALTER COLUMN received_by DROP NOT NULL;
ALTER TABLE payments ADD CONSTRAINT payments_online_has_no_receiver
  CHECK ((method = 'online') = (received_by IS NULL));

-- ---------------------------------------------------------------------------
-- An intent to pay online: created when the student asks to pay, becomes a
-- `payments` row only once actually paid (mirrors what a real gateway's
-- signed webhook would confirm). `provider` is 'dummy' today; a real
-- integration changes this value and the adapter behind it, not this table.
-- ---------------------------------------------------------------------------
CREATE TABLE fee_online_intents (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  amount_paise  bigint NOT NULL CHECK (amount_paise > 0),
  status        text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  provider      text NOT NULL DEFAULT 'dummy',
  provider_ref  text,
  payment_id    uuid REFERENCES payments(id),
  created_by    uuid NOT NULL REFERENCES persons(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  version       int NOT NULL DEFAULT 1,

  CONSTRAINT fee_online_intent_completion_has_provenance
    CHECK (status = 'created' OR completed_at IS NOT NULL)
);
CREATE INDEX fee_online_intents_student_idx ON fee_online_intents (student_id, created_at);
-- A completed intent (paid or failed) is never revisited to a different payment.
CREATE UNIQUE INDEX fee_online_intents_payment_uq ON fee_online_intents (payment_id) WHERE payment_id IS NOT NULL;

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  ALTER TABLE fee_online_intents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE fee_online_intents FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE fee_online_intents FROM PUBLIC;

  CREATE POLICY tenant_isolation ON fee_online_intents
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  -- created -> paid|failed is the only update this row ever takes.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON fee_online_intents TO %I', app_role);
END $$;

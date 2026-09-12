-- 018_idempotency_keys.sql
--
-- Replay-safe field writes: slice one of the offline outbox (AD-58).
--
-- A field write carries an Idempotency-Key. The outcome is stored against it,
-- so a resend of a write whose response was lost gets that outcome back instead
-- of being applied again or refused as a false conflict. The version pinning of
-- AD-52 stays: it answers a different question.
--
-- This is a cache of outcomes, not history. Rows expire after 24 hours, a server
-- error releases its row, and nothing references one, which is why the
-- application role holds DELETE here.
--
-- See docs/blueprint/capabilities/offline-outbox.md.

CREATE TABLE idempotency_keys (
  tenant_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- The person the key belongs to. A key is meaningful only to its owner, so
  -- nobody can replay, or detect, another person's response by guessing one.
  actor_id        uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  key             text NOT NULL CHECK (key ~ '^[A-Za-z0-9_-]{8,128}$'),
  method          text NOT NULL,
  -- The matched route pattern, for reading the table, and the concrete address,
  -- so a key cannot be replayed against a different resource.
  route           text NOT NULL,
  target          text NOT NULL,
  -- sha256 of method, address and body. The same key sent for a different
  -- request is refused rather than answered with the first request's outcome.
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed')),
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  PRIMARY KEY (tenant_id, actor_id, key),
  CONSTRAINT idempotency_completed_has_outcome
    CHECK (status <> 'completed' OR (response_status IS NOT NULL AND completed_at IS NOT NULL))
);

-- For expiring old outcomes.
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

DO $$
DECLARE
  v_app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
  ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON idempotency_keys
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE idempotency_keys FROM PUBLIC;
  -- DELETE, uniquely among tenant tables with history rules: a released or
  -- expired outcome is a cache entry, and nothing references it.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO %I', v_app_role);
END $$;

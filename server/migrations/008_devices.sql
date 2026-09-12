-- 008_devices.sql
--
-- Where a notification can be delivered.
--
-- The ERP decides who is notified and why; this records only the address. The
-- payload itself carries identifiers and never content, so a notification
-- centre on a lost phone reveals nothing (API contract 5.7).

CREATE TABLE devices (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  person_id      uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  account_id     uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  platform       text NOT NULL CHECK (platform IN ('android','ios','web')),
  -- Hashed, not stored in the clear. A push token is a capability: anyone
  -- holding it can send that device a notification, so a database leak must not
  -- hand an attacker the ability to push to every user.
  push_token_hash text NOT NULL,
  app_version    text,
  device_label   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_reason text
);

-- One live registration per token. Re-registering the same device updates it
-- rather than accumulating rows, which is what happens on every app launch.
CREATE UNIQUE INDEX devices_active_token_uq
  ON devices (tenant_id, push_token_hash) WHERE revoked_at IS NULL;

-- The delivery path: given a person, where can they be reached.
CREATE INDEX devices_person_idx ON devices (person_id) WHERE revoked_at IS NULL;

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Explicit, per the invariant: a new table declares its runtime privileges in
-- the migration that creates it. No DELETE, because revocation is a soft state
-- that must remain visible in the register.
DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON devices TO %I', app_role);
END $$;

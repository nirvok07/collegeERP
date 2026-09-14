-- 028_otp_sign_in.sql
--
-- OTP-1 (AD-82): sign-in by a one-time code sent to the person's email or
-- mobile, for college accounts and platform accounts alike.
--
-- One row per code asked for. Stored as hashes like every other
-- authentication token here (the client holds an opaque challenge token; the
-- code itself is never stored), because single use must hold across server
-- instances.
--
-- A request for an identifier nobody has still gets a row, with no owner and
-- no code: the answer is identical either way (BR-24), verifying it always
-- fails, and it counts toward the same rate limit.

CREATE TABLE otp_challenges (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid REFERENCES institutions(id) ON DELETE RESTRICT,
  account_id          uuid REFERENCES user_accounts(id) ON DELETE CASCADE,
  platform_account_id uuid REFERENCES platform_accounts(id) ON DELETE CASCADE,
  -- What was typed, hashed: the rate limit is per identifier, known or not.
  identifier_hash     text NOT NULL,
  channel             text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  token_hash          text NOT NULL UNIQUE,
  -- NULL for a decoy: there is no code that could match.
  code_hash           text,
  expires_at          timestamptz NOT NULL,
  consumed_at         timestamptz,
  attempts            int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT otp_challenges_one_owner
    CHECK (NOT (account_id IS NOT NULL AND platform_account_id IS NOT NULL)),
  -- A college account's code belongs to its college; a platform one to none.
  CONSTRAINT otp_challenges_tenant_matches_owner
    CHECK (account_id IS NULL OR tenant_id IS NOT NULL),
  CONSTRAINT otp_challenges_platform_has_no_tenant
    CHECK (platform_account_id IS NULL OR tenant_id IS NULL),
  CONSTRAINT otp_challenges_owner_has_code
    CHECK ((account_id IS NULL AND platform_account_id IS NULL) = (code_hash IS NULL))
);

CREATE INDEX otp_challenges_identifier_idx ON otp_challenges (identifier_hash, created_at DESC);
CREATE INDEX otp_challenges_account_idx ON otp_challenges (account_id) WHERE consumed_at IS NULL;
CREATE INDEX otp_challenges_platform_idx ON otp_challenges (platform_account_id) WHERE consumed_at IS NULL;

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
  api_role text;
BEGIN
  ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
  ALTER TABLE otp_challenges FORCE ROW LEVEL SECURITY;
  -- College rows are the college's; platform rows (tenant NULL) are seen only
  -- with no college in context, exactly as refresh_tokens (001).
  CREATE POLICY tenant_isolation ON otp_challenges
    USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);
  REVOKE ALL ON TABLE otp_challenges FROM PUBLIC;
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE otp_challenges FROM %I', api_role);
    END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON otp_challenges TO %I', app_role);
END $$;

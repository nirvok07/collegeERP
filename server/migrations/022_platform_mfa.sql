-- 022_platform_mfa.sql
--
-- SA-3b: the platform's second factor (AD-62) with sealed secrets (AD-63).
--
-- 1. platform_accounts gains the TOTP secret, sealed with AES-256-GCM by the
--    application (never plaintext, never a hash), the secret being enrolled,
--    also sealed, and the last accepted time step so a code cannot be replayed.
-- 2. invitation_tokens carries platform invitations as well as college ones,
--    exactly as refresh_tokens carries both (migration 001): one invitation
--    system, not two.
-- 3. platform_auth_challenges holds the short-lived, single-use step between
--    the password and the second factor. It is stored as a hash like every
--    other authentication token here, because single use must hold across
--    server instances.

ALTER TABLE platform_accounts
  ADD COLUMN totp_secret_sealed  text,
  ADD COLUMN totp_pending_sealed text,
  ADD COLUMN totp_enrolled_at    timestamptz,
  ADD COLUMN totp_last_step      bigint,
  -- Enrolled exactly when a secret is held. There is no "enrolled without a
  -- secret" and no "secret without enrolment": MFA cannot be switched off.
  ADD CONSTRAINT platform_accounts_totp_enrolled_has_secret
    CHECK ((totp_enrolled_at IS NULL) = (totp_secret_sealed IS NULL));

ALTER TABLE invitation_tokens ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE invitation_tokens ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE invitation_tokens
  ADD COLUMN platform_account_id uuid REFERENCES platform_accounts(id) ON DELETE CASCADE,
  ADD CONSTRAINT invitation_tokens_one_owner
    CHECK ((account_id IS NOT NULL) <> (platform_account_id IS NOT NULL)),
  -- A college invitation belongs to its college; a platform one to none.
  ADD CONSTRAINT invitation_tokens_tenant_matches_owner
    CHECK ((account_id IS NOT NULL) = (tenant_id IS NOT NULL));

CREATE TABLE platform_auth_challenges (
  id                  uuid PRIMARY KEY,
  platform_account_id uuid NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
  purpose             text NOT NULL CHECK (purpose IN ('second_factor', 'enrolment')),
  token_hash          text NOT NULL UNIQUE,
  expires_at          timestamptz NOT NULL,
  consumed_at         timestamptz,
  attempts            int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_auth_challenges_account_idx ON platform_auth_challenges (platform_account_id);

DO $$
DECLARE
  v_app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
  v_api_role text;
BEGIN
  ALTER TABLE platform_auth_challenges ENABLE ROW LEVEL SECURITY;
  ALTER TABLE platform_auth_challenges FORCE ROW LEVEL SECURITY;
  EXECUTE format(
    'CREATE POLICY app_role_only ON platform_auth_challenges USING (current_user = %L) WITH CHECK (current_user = %L)',
    v_app_role, v_app_role);
  REVOKE ALL ON TABLE platform_auth_challenges FROM PUBLIC;
  FOREACH v_api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE platform_auth_challenges FROM %I', v_api_role);
    END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON platform_auth_challenges TO %I', v_app_role);
END $$;

-- The operator's break-glass reset (AD-63) is a system event about a platform
-- account, never about a college. Owners must see it in the platform audit
-- view (AD-61), so the read also returns system events whose subject is a
-- platform account. College events stay invisible exactly as before.
CREATE OR REPLACE FUNCTION platform_audit_events(
  p_tenant uuid, p_action text, p_from timestamptz, p_to timestamptz,
  p_before_at timestamptz, p_before_id uuid, p_limit int
)
RETURNS TABLE (
  id uuid, at timestamptz, cursor_at text, correlation_id uuid,
  tenant_id uuid, college_code text, college_name text,
  actor_id uuid, actor_name text, actor_email text,
  action text, subject_type text, subject_id uuid,
  before_state jsonb, after_state jsonb, reason text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT e.id, e.at, e.at::text, e.correlation_id,
         e.tenant_id, i.code, i.name,
         e.actor_id, pa.full_name, pa.email,
         e.action, e.subject_type, e.subject_id,
         e.before_state, e.after_state, e.reason
    FROM audit_events e
    LEFT JOIN institutions i ON i.id = e.tenant_id
    LEFT JOIN platform_accounts pa ON pa.id = e.actor_id
   WHERE (e.actor_type = 'platform'
          OR (e.actor_type = 'system' AND e.tenant_id IS NULL AND e.subject_type = 'platform_account'))
     AND (p_tenant IS NULL OR e.tenant_id = p_tenant)
     AND (p_action IS NULL OR e.action = p_action)
     AND (p_from IS NULL OR e.at >= p_from)
     AND (p_to IS NULL OR e.at < p_to)
     AND (p_before_at IS NULL OR (e.at, e.id) < (p_before_at, p_before_id))
   ORDER BY e.at DESC, e.id DESC
   LIMIT least(greatest(coalesce(p_limit, 51), 1), 101)
$$;

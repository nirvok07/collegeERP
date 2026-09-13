-- 021_platform_roles.sql
--
-- SA-3a: platform roles and application-managed platform accounts.
--
-- AD-1 forbids a role column, so a platform role is an assignment with
-- history, one active per account, exactly as tenant roles are. Two roles,
-- Owner and Support; what each may do is the permission table in
-- identity/domain/platform-authority.ts, not a name compared in code.
--
-- A platform account created through the application starts `invited` with no
-- credential, and cannot sign in until SA-3b issues its invitation together
-- with authenticator enrolment (AD-62, AD-63). No account can be created that
-- works without a second factor once SA-3b ships.
--
-- Every existing platform account is all-powerful today, so each becomes an
-- Owner here. Bootstrapping the very first Owner stays an operator action.

ALTER TABLE platform_accounts DROP CONSTRAINT platform_accounts_status_check;
ALTER TABLE platform_accounts ADD CONSTRAINT platform_accounts_status_check
  CHECK (status IN ('invited', 'active', 'suspended', 'deactivated'));
ALTER TABLE platform_accounts ALTER COLUMN credential_hash DROP NOT NULL;
ALTER TABLE platform_accounts ADD CONSTRAINT platform_accounts_credential_unless_invited
  CHECK (credential_hash IS NOT NULL OR status = 'invited');

CREATE TABLE platform_role_assignments (
  id                  uuid PRIMARY KEY,
  platform_account_id uuid NOT NULL REFERENCES platform_accounts(id) ON DELETE RESTRICT,
  role                text NOT NULL CHECK (role IN ('owner', 'support')),
  -- NULL only for the backfill below and for operator bootstrap.
  granted_by          uuid REFERENCES platform_accounts(id),
  granted_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  ended_by            uuid REFERENCES platform_accounts(id),
  reason              text,
  CHECK (ended_at IS NULL OR ended_at >= granted_at)
);

-- One live role per account.
CREATE UNIQUE INDEX platform_role_assignments_one_active
  ON platform_role_assignments (platform_account_id) WHERE ended_at IS NULL;

-- History is kept: an assignment is ended, never edited or reopened.
CREATE OR REPLACE FUNCTION platform_role_assignment_valid() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.platform_account_id <> OLD.platform_account_id OR NEW.role <> OLD.role
     OR NEW.granted_at <> OLD.granted_at OR NEW.granted_by IS DISTINCT FROM OLD.granted_by THEN
    RAISE EXCEPTION 'A platform role assignment cannot be edited; end it and grant another.'
      USING ERRCODE = '23001';
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'An ended platform role assignment cannot be changed.' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_role_assignment_valid
  BEFORE UPDATE ON platform_role_assignments
  FOR EACH ROW EXECUTE FUNCTION platform_role_assignment_valid();

INSERT INTO platform_role_assignments (id, platform_account_id, role, reason)
SELECT gen_random_uuid(), pa.id, 'owner', 'Existing platform account at SA-3a (migration 021)'
  FROM platform_accounts pa;

-- Same protection as platform_accounts (migration 006): no tenant column, so a
-- deny-by-default policy that admits only the application role.
DO $$
DECLARE
  v_app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
  v_api_role text;
BEGIN
  ALTER TABLE platform_role_assignments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE platform_role_assignments FORCE ROW LEVEL SECURITY;
  EXECUTE format(
    'CREATE POLICY app_role_only ON platform_role_assignments USING (current_user = %L) WITH CHECK (current_user = %L)',
    v_app_role, v_app_role);
  REVOKE ALL ON TABLE platform_role_assignments FROM PUBLIC;
  FOREACH v_api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE platform_role_assignments FROM %I', v_api_role);
    END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON platform_role_assignments TO %I', v_app_role);
  -- Accounts are now created by the application, not by SQL.
  EXECUTE format('GRANT INSERT ON platform_accounts TO %I', v_app_role);
END $$;

-- 006_revoke_data_api_roles.sql
--
-- Supabase exposes the `public` schema through PostgREST, reachable by anyone
-- holding the publishable key, which is public by design. Those requests run as
-- the `anon` or `authenticated` roles.
--
-- Most of our tables are protected anyway: their RLS policies key off
-- current_setting('app.tenant_id'), which PostgREST never sets, so the policy
-- evaluates to false and returns nothing. But `institutions` and
-- `platform_accounts` carry no tenant_id and therefore no policy, and
-- platform_accounts holds emails and credential hashes.
--
-- The API roles are therefore revoked explicitly. Our application connects as
-- erp_app, which keeps its grants, so nothing about the application changes.
-- Guarded by a role-existence check, so it is a harmless no-op on a plain
-- PostgreSQL instance that has no Supabase roles.

DO $$
DECLARE
  api_role text;
  tbl text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', api_role);
      RAISE NOTICE 'revoked Data API access from role %', api_role;
    END IF;
  END LOOP;

  -- Future tables must not silently become readable either.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;

  -- PUBLIC is every role. Nothing here should be world-readable.
  FOREACH tbl IN ARRAY ARRAY[
    'institutions','platform_accounts','campuses','departments','persons',
    'user_accounts','credentials','invitation_tokens','refresh_tokens',
    'role_definitions','role_assignments','permissions','audit_events','login_attempts'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', tbl);
  END LOOP;
END $$;

-- institutions and platform_accounts have no tenant column, so they cannot use
-- the tenant_isolation policy. They get deny-by-default policies instead, so
-- that a future grant or a misconfigured role still reads nothing. erp_app is
-- unaffected: it is the table owner's delegate and these policies apply only to
-- roles that are not granted an explicit policy below.
ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY app_role_only ON platform_accounts
  USING (current_user = 'erp_app') WITH CHECK (current_user = 'erp_app');

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
CREATE POLICY app_role_only ON institutions
  USING (current_user = 'erp_app') WITH CHECK (current_user = 'erp_app');

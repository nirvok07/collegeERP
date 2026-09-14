-- 026_session_functions_read_refresh_tokens.sql
--
-- Session renewal (005) finds a presented token through
-- auth_resolve_refresh_token and ends a family through auth_revoke_token_family.
-- Both are SECURITY DEFINER, owned by the migrator role, and run before any
-- tenant context exists. refresh_tokens forces row-level security with a policy
-- that admits only rows whose tenant matches app.tenant_id, so with no tenant
-- set the migrator sees platform rows (tenant_id NULL) and nothing else.
--
-- Locally this never showed: the bootstrap grants the migrator BYPASSRLS when
-- it runs as a superuser. Supabase's bootstrap is not a superuser, so there
-- every college user's refresh token was invisible to the lookup: the first
-- renewal, fifteen minutes after sign-in, answered "Your session has ended",
-- and signing out or detecting replay revoked nothing. Platform sessions carry
-- no college and kept working, which hid it. Same cause as 025.
--
-- The fix is one permissive policy for the migrator role, SELECT for the lookup
-- and UPDATE for the revocation. It widens nothing the application can see:
-- the application still reaches refresh_tokens as its own role through
-- tenant_isolation, and the migrator already owns the table.

DO $$
DECLARE
  migrator_role text := coalesce(nullif(current_setting('erp.migrator_role', true), ''), 'erp_migrator');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'refresh_tokens' AND policyname = 'migrator_resolves'
  ) THEN
    EXECUTE format(
      'CREATE POLICY migrator_resolves ON refresh_tokens FOR SELECT USING (current_user = %L)',
      migrator_role);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'refresh_tokens' AND policyname = 'migrator_revokes'
  ) THEN
    EXECUTE format(
      'CREATE POLICY migrator_revokes ON refresh_tokens FOR UPDATE USING (current_user = %L) WITH CHECK (current_user = %L)',
      migrator_role, migrator_role);
  END IF;
END $$;

-- 025_seat_check_reads_institutions.sql
--
-- The seat check (023) is SECURITY DEFINER, owned by the migrator role, and
-- reads the college's seat_limit from institutions. institutions carries only
-- the app_role_only policy (006), and row-level security is forced, so inside
-- the function the migrator saw no college, read the limit as 0 and refused
-- every account, including a new college's first administrator.
--
-- Locally this never showed: the bootstrap grants the migrator BYPASSRLS when
-- it runs as a superuser. Supabase's bootstrap is not a superuser, so the
-- migrator there has no BYPASSRLS and provisioning failed with
-- "This college is using all 0 of its seats".
--
-- The fix is one permissive, read-only policy for the migrator role. It widens
-- nothing the application can see: the application still reads institutions as
-- its own role through app_role_only, and the migrator already owns the table.

DO $$
DECLARE
  migrator_role text := coalesce(nullif(current_setting('erp.migrator_role', true), ''), 'erp_migrator');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'institutions' AND policyname = 'migrator_reads'
  ) THEN
    EXECUTE format(
      'CREATE POLICY migrator_reads ON institutions FOR SELECT USING (current_user = %L)',
      migrator_role);
  END IF;
END $$;

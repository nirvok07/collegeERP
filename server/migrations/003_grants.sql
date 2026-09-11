-- 003_grants.sql
-- Least privilege for the application role.
--
-- audit_events and login_attempts receive INSERT and SELECT only. The
-- append-only claim in the audit writer is therefore enforced by the database,
-- not merely by the absence of an update method in the code.
--
-- No DELETE anywhere. AD-8 and BR-17: records are soft-deleted, never removed,
-- so tombstones propagate and audit references stay resolvable.
--
-- The role name is resolved at migration time rather than hard-coded, so a
-- deployment may name it differently, and a missing role fails with an
-- instruction instead of "role does not exist".

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('erp.app_role', true), ''), 'erp_app');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE EXCEPTION
      'Application role "%" does not exist. Roles are provisioned before the migration chain, because a migration cannot create the role it runs as. Run "npm run db:setup" for a local database, or set BOOTSTRAP_DATABASE_URL to an administrative connection so "npm run migrate" can provision them.',
      app_role
      USING ERRCODE = 'undefined_object';
  END IF;

  EXECUTE format($g$
    GRANT SELECT, INSERT, UPDATE ON
      institutions, campuses, departments, persons, user_accounts, credentials,
      invitation_tokens, refresh_tokens, role_definitions, role_assignments
    TO %I
  $g$, app_role);

  EXECUTE format('GRANT SELECT ON permissions TO %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT ON audit_events, login_attempts TO %I', app_role);
END $$;

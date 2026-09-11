-- bootstrap/001_roles.sql
--
-- Roles are CLUSTER-level objects; migrations are DATABASE-level. A migration
-- cannot create the role it runs as, so role provisioning happens here, with an
-- administrative connection, before the migration chain.
--
-- This file is idempotent and hard-codes nothing: names and passwords arrive as
-- transaction-local settings from the runner, which reads them from the
-- environment.
--
-- Two roles, and the separation is the point:
--   * the application role has no BYPASSRLS and no DELETE, so the isolation in
--     AD-22 genuinely constrains it
--   * the migration role owns the schema. BYPASSRLS is granted when the
--     bootstrap connection is a superuser and skipped otherwise; the migration
--     chain does not depend on it.

DO $$
DECLARE
  app_role  text := nullif(current_setting('erp.app_role', true), '');
  app_pw    text := nullif(current_setting('erp.app_password', true), '');
  mig_role  text := nullif(current_setting('erp.migrator_role', true), '');
  mig_pw    text := nullif(current_setting('erp.migrator_password', true), '');
  am_super  boolean;
BEGIN
  IF app_role IS NULL THEN
    RAISE EXCEPTION 'erp.app_role must be set by the bootstrap runner';
  END IF;

  SELECT rolsuper INTO am_super FROM pg_roles WHERE rolname = current_user;

  -- Application role.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    IF app_pw IS NULL THEN
      RAISE EXCEPTION 'Cannot create role % without a password. Set the application password in the environment.', app_role;
    END IF;
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
      app_role, app_pw);
    RAISE NOTICE 'created application role %', app_role;
  ELSIF app_pw IS NOT NULL THEN
    EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', app_role, app_pw);
  END IF;

  -- The application must never bypass row level security, whatever it was
  -- created as previously.
  EXECUTE format('ALTER ROLE %I NOBYPASSRLS NOSUPERUSER', app_role);

  -- Migration role, when one distinct from the bootstrap connection is wanted.
  IF mig_role IS NOT NULL AND mig_role <> current_user THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = mig_role) THEN
      IF mig_pw IS NULL THEN
        RAISE EXCEPTION 'Cannot create role % without a password.', mig_role;
      END IF;
      EXECUTE format(
        'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE',
        mig_role, mig_pw);
      RAISE NOTICE 'created migration role %', mig_role;
    ELSIF mig_pw IS NOT NULL THEN
      EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', mig_role, mig_pw);
    END IF;

    -- BYPASSRLS requires superuser to grant. Managed PostgreSQL, Supabase
    -- included, does not give the administrative role superuser, so this is
    -- skipped there. Nothing in the migration chain requires it.
    IF am_super THEN
      EXECUTE format('ALTER ROLE %I BYPASSRLS', mig_role);
    ELSE
      RAISE NOTICE
        'Not a superuser, so BYPASSRLS was not granted to %. Migrations do not require it.', mig_role;
    END IF;

    EXECUTE format('GRANT %I TO %I', mig_role, current_user);
  END IF;

  -- Schema access. Object-level grants belong to the migration chain.
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  IF mig_role IS NOT NULL AND mig_role <> current_user THEN
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', mig_role);
  END IF;
END $$;

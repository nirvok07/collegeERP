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
  has_super boolean;
  has_bypass boolean;
BEGIN
  IF app_role IS NULL THEN
    RAISE EXCEPTION 'erp.app_role must be set by the bootstrap runner';
  END IF;

  SELECT rolsuper INTO am_super FROM pg_roles WHERE rolname = current_user;

  -- Application role.
  --
  -- The password is optional. Without one the role is created NOLOGIN, which is
  -- the right shape when the schema is being prepared before the application
  -- exists, and it avoids typing a credential into a dashboard SQL editor where
  -- it would be kept in query history. Grant LOGIN and a password later, over a
  -- connection you control.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    IF app_pw IS NULL THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', app_role);
      RAISE NOTICE
        'created application role % with NOLOGIN. Before the application can connect, run: ALTER ROLE %I LOGIN PASSWORD ''<password>'';',
        app_role, app_role;
    ELSE
      EXECUTE format(
        'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
        app_role, app_pw);
      RAISE NOTICE 'created application role %', app_role;
    END IF;
  ELSIF app_pw IS NOT NULL THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', app_role, app_pw);
  END IF;

  -- The application must never be a superuser or bypass row level security.
  --
  -- Only a superuser may specify those attributes in ALTER ROLE, even to turn
  -- them off, so on managed PostgreSQL this asserts rather than enforces. That
  -- is sufficient: CREATE ROLE above set them correctly, and if some other path
  -- granted them, failing loudly is better than appearing to fix it.
  SELECT rolsuper, rolbypassrls INTO has_super, has_bypass
    FROM pg_roles WHERE rolname = app_role;

  IF has_super OR has_bypass THEN
    IF am_super THEN
      EXECUTE format('ALTER ROLE %I NOBYPASSRLS NOSUPERUSER', app_role);
      RAISE NOTICE 'removed excess privileges from %', app_role;
    ELSE
      RAISE EXCEPTION
        'Role % holds SUPERUSER or BYPASSRLS, which would defeat tenant isolation, and this connection is not a superuser so it cannot be corrected here. Remove those attributes with an administrative connection before continuing.',
        app_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

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

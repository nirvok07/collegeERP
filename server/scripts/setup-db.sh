#!/usr/bin/env bash
# Two roles, deliberately:
#
#   erp_migrator  owns the schema and has BYPASSRLS. Migrations and platform
#                 reference data are a DBA operation.
#   erp_app       the application. NOSUPERUSER and NOBYPASSRLS, so row level
#                 security genuinely constrains it. Without this separation the
#                 isolation guarantee in AD-22 could not be proven, because a
#                 superuser bypasses RLS unconditionally.
set -euo pipefail

DB_NAME="${DB_NAME:-college_erp_dev}"
APP_ROLE="${APP_ROLE:-erp_app}"
APP_PASSWORD="${APP_PASSWORD:-erp_app_local}"
MIGRATOR_ROLE="${MIGRATOR_ROLE:-erp_migrator}"
MIGRATOR_PASSWORD="${MIGRATOR_PASSWORD:-erp_migrator_local}"

psql -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
    CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${MIGRATOR_ROLE}') THEN
    CREATE ROLE ${MIGRATOR_ROLE} LOGIN PASSWORD '${MIGRATOR_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END
\$\$;
SQL

if ! psql -lqt | cut -d'|' -f1 | grep -qw "${DB_NAME}"; then
  createdb -O "${MIGRATOR_ROLE}" "${DB_NAME}"
fi

psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<SQL
GRANT CONNECT ON DATABASE ${DB_NAME} TO ${APP_ROLE}, ${MIGRATOR_ROLE};
ALTER SCHEMA public OWNER TO ${MIGRATOR_ROLE};
GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
SQL

echo "database ${DB_NAME} ready: ${MIGRATOR_ROLE} owns the schema, ${APP_ROLE} is the application"

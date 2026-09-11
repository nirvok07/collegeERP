#!/usr/bin/env bash
# Creates the development and test databases.
#
# Roles are NOT created here. They are provisioned by bootstrap/001_roles.sql,
# run by `npm run migrate` with BOOTSTRAP_DATABASE_URL set, so there is exactly
# one place that decides what privileges each role holds. Keeping a second copy
# in a shell script is how the two drift apart.
set -euo pipefail

ADMIN_DB="${ADMIN_DB:-postgres}"
for DB in "${DB_NAME:-college_erp_dev}" "${TEST_DB_NAME:-college_erp_test}"; do
  if ! psql -d "$ADMIN_DB" -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
    createdb "$DB"
    echo "created database $DB"
  else
    echo "database $DB already exists"
  fi
done

cat <<'NOTE'

Next: npm run migrate
  With BOOTSTRAP_DATABASE_URL set to an administrative connection, that command
  provisions roles and then applies the migration chain.
NOTE

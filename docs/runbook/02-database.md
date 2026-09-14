# 2. Database

The system of record is PostgreSQL. The server connects with two roles, never as a superuser:

| Role | Used by | Can |
|---|---|---|
| `erp_app` | the running API (`DATABASE_URL`) | read and write rows, always under row-level security; no DELETE, no BYPASSRLS |
| `erp_migrator` | migrations (`MIGRATION_DATABASE_URL`) | owns the schema |

Roles are created once, per PostgreSQL server, by `bootstrap/001_roles.sql`, run through an
administrative connection (`BOOTSTRAP_DATABASE_URL`). The password of each role is taken from the
password in its URL. Migrations then run as `erp_migrator` and refuse to start if the application
role is missing, so a database is never left half-migrated.

Choose **one** of the two options below for development. The server's tests always use their own
local database (see [Tests](07-tests-and-builds.md)), whichever you choose here.

## Option A: local PostgreSQL

```bash
cd server
npm install
npm run db:setup      # creates college_erp_dev and college_erp_test (skips any that exist)
```

In `server/.env` (see [Server](03-server.md)), use the local values:

```bash
DATABASE_URL=postgres://erp_app:erp_app_local@localhost:5432/college_erp_dev
MIGRATION_DATABASE_URL=postgres://erp_migrator:erp_migrator_local@localhost:5432/college_erp_dev
BOOTSTRAP_DATABASE_URL=postgres://<your-admin-user>@localhost:5432/college_erp_dev
```

`<your-admin-user>` is a PostgreSQL superuser on your machine (often your OS user name with
Homebrew, or `postgres`). Then:

```bash
npm run migrate       # provisions the two roles (because BOOTSTRAP_DATABASE_URL is set), then applies every migration
```

After the first successful run you may empty `BOOTSTRAP_DATABASE_URL`; later `npm run migrate` runs
only apply new migrations. Roles are cluster-wide, so the test database uses the same two roles.

Keep the `erp_app_local` and `erp_migrator_local` passwords on a local machine only: the test suite
connects with exactly those.

## Option B: Supabase (shared development database)

Supabase is used as plain PostgreSQL through its **session pooler** (port 5432), with no SDK. It is
for development and app testing only; production runs the same server on our own PostgreSQL (AD-68).

1. In the Supabase dashboard (Project Settings → Database) copy the direct connection URL and the
   session-pooler URL.
2. Put them in `server/.env`:

   ```bash
   SUPABASE_DB_URL=postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres
   SUPABASE_POOLER_DATABASE_URL=postgresql://erp_app.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

3. Rebuild the development schema. **This clears the `public` schema**, so it refuses unless you
   type the confirmation phrase, and refuses outright if any table holds real data:

   ```bash
   npm run db:supabase:rebuild -- --confirm "REBUILD <project-ref>"
   ```

   It provisions the two roles, applies every migration, checks the application role can connect,
   and rewrites `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `BOOTSTRAP_DATABASE_URL` in
   `server/.env`. Your previous local values are kept as `LOCAL_*` lines.

Pooler user names have the form `<role>.<project-ref>`.

### Switching between local and Supabase

`server/.env` holds both sets. To switch, copy the `LOCAL_*` values into `DATABASE_URL`,
`MIGRATION_DATABASE_URL` (and `BOOTSTRAP_DATABASE_URL` if needed), or back. Restart the server.

## New migrations

Migrations live in `server/migrations/NNN_name.sql` and are applied in order, once each, and
recorded. To apply new ones to whichever database `.env` names:

```bash
cd server && npm run migrate
```

Never edit an applied migration; add a new one.

## Backups

Development data is disposable. For anything you care about, take a dump before a rebuild:

```bash
pg_dump "<a connection URL with a superuser or the migrator>" > backup.sql
```

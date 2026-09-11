/**
 * Plain SQL migrations, applied in filename order and recorded once.
 * Standard PostgreSQL only, so production migration is an infrastructure move
 * rather than an application rewrite.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.ts';
import { loadConfig } from '../../config/config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '../../../migrations');
const BOOTSTRAP_DIR = join(HERE, '../../../bootstrap');

export interface RoleNames {
  appRole: string;
  appPassword?: string;
  migratorRole: string;
  migratorPassword?: string;
}

/**
 * Provisions roles with an administrative connection.
 *
 * Roles are cluster-level and migrations are database-level, so a migration
 * cannot create the role it runs as. This step closes that gap without making
 * role creation a manual instruction in a README.
 */
export async function bootstrapRoles(
  adminUrl: string,
  roles: RoleNames,
  log: (m: string) => void = console.log,
): Promise<void> {
  const pool = createPool(adminUrl);
  const client = await pool.connect();
  try {
    const files = (await readdir(BOOTSTRAP_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(join(BOOTSTRAP_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        // Passed as settings, never interpolated into SQL by the runner.
        await client.query('SELECT set_config($1,$2,true)', ['erp.app_role', roles.appRole]);
        await client.query('SELECT set_config($1,$2,true)', ['erp.app_password', roles.appPassword ?? '']);
        await client.query('SELECT set_config($1,$2,true)', ['erp.migrator_role', roles.migratorRole]);
        await client.query('SELECT set_config($1,$2,true)', ['erp.migrator_password', roles.migratorPassword ?? '']);
        await client.query(sql);
        await client.query('COMMIT');
        log(`bootstrap ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`bootstrap ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Derives role names and passwords for bootstrapping.
 *
 * Precedence is APP_DB_ROLE / MIGRATOR_DB_ROLE first, then the connection
 * string's username, then the default.
 *
 * The order matters on managed PostgreSQL that fronts connections with a pooler.
 * Supabase's pooler authenticates as `<role>.<project-ref>`, for example
 * `postgres.abcdefgh`, which is a routing identifier and not a role that exists
 * in pg_roles. Taking the username as the role name there would try to create a
 * role called "erp_app.abcdefgh". The explicit variables are what make the
 * pooler path work, so they win.
 */
export function rolesFromUrls(
  appUrl: string,
  migratorUrl: string,
  explicit: { appRole?: string; migratorRole?: string },
): RoleNames {
  const parse = (url: string) => {
    try {
      const u = new URL(url);
      const username = decodeURIComponent(u.username) || undefined;
      return {
        // Strip a pooler's project-ref suffix if it is the only thing available.
        role: username?.includes('.') ? username.split('.')[0] : username,
        password: decodeURIComponent(u.password) || undefined,
      };
    } catch {
      return {};
    }
  };
  const app = parse(appUrl);
  const migrator = parse(migratorUrl);
  return {
    appRole: explicit.appRole ?? app.role ?? 'erp_app',
    appPassword: app.password,
    migratorRole: explicit.migratorRole ?? migrator.role ?? 'erp_migrator',
    migratorPassword: migrator.password,
  };
}

export const BOOTSTRAP_INSTRUCTION =
  'Roles are provisioned before the migration chain, because a migration cannot create the role it runs as. ' +
  'Run `npm run db:bootstrap` with BOOTSTRAP_DATABASE_URL set to an administrative connection, ' +
  'or set that variable and run `npm run migrate`, which bootstraps first.';

/**
 * Pre-flight. Runs before the first migration, so a missing role cannot leave a
 * database half-migrated with tables created and grants never applied.
 *
 * Deliberately not left to PostgreSQL's own error from a later GRANT: by then
 * 001 and 002 have committed and the operator has to reason about partial state.
 */
export async function assertApplicationRole(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  appRole: string,
): Promise<void> {
  const { rows } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appRole]);
  if (rows.length === 0) {
    throw new Error(
      `Pre-flight failed: application role "${appRole}" does not exist. ` +
        `No migration has been applied. ${BOOTSTRAP_INSTRUCTION}`,
    );
  }
}

export async function migrate(
  databaseUrl: string,
  log: (m: string) => void = console.log,
  appRole = 'erp_app',
) {
  const pool = createPool(databaseUrl);
  const client = await pool.connect();
  try {
    // Nothing is applied until the prerequisite holds.
    await assertApplicationRole(client, appRole);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        // Transaction-local, so a migration can grant to the configured role
        // without the name being compiled into the SQL.
        await client.query('SELECT set_config($1,$2,true)', ['erp.app_role', appRole]);
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();

  if (config.BOOTSTRAP_DATABASE_URL) {
    await bootstrapRoles(
      config.BOOTSTRAP_DATABASE_URL,
      rolesFromUrls(config.DATABASE_URL, config.MIGRATION_DATABASE_URL, {
        appRole: process.env.APP_DB_ROLE,
        migratorRole: process.env.MIGRATOR_DB_ROLE,
      }),
    );
  }

  await migrate(config.MIGRATION_DATABASE_URL, console.log, config.APP_DB_ROLE);
  console.log('migrations up to date');
}

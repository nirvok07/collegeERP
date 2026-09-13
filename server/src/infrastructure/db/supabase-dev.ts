/**
 * AD-68: Supabase is the database for development and app testing, reached
 * only as standard PostgreSQL through its session pooler. Nothing here is a
 * Supabase SDK: these helpers derive the three connections the server already
 * uses from the two values Supabase provides, guard the one-time rebuild, and
 * rewrite server/.env. Pure, so they are tested without a network.
 */
import { randomBytes } from 'node:crypto';

export interface SupabaseUrls {
  projectRef: string;
  /** The `postgres` role: provisions roles and drops the stale schema. */
  admin: string;
  /** The least-privilege application role the server runs as. */
  app: string;
  /** The migration role that owns the schema. */
  migrator: string;
}

/**
 * Supabase's pooler authenticates `<role>.<project-ref>`. Session mode (port
 * 5432) keeps session state, which the transaction-mode port would not. No
 * sslmode is written into the URLs: `createPool` turns TLS on for Supabase
 * hosts itself, and a URL sslmode would override it with certificate checks
 * Supabase's chain does not pass.
 */
export function supabaseUrls(
  directUrl: string,
  poolerUrl: string,
  migratorPassword: string = randomBytes(24).toString('hex'),
): SupabaseUrls {
  const direct = new URL(directUrl);
  const pooler = new URL(poolerUrl);
  const [appRole, projectRef] = decodeURIComponent(pooler.username).split('.');
  if (!appRole || !projectRef) {
    throw new Error('SUPABASE_POOLER_DATABASE_URL must authenticate as <role>.<project-ref>.');
  }
  if (appRole === 'postgres') {
    throw new Error(
      "SUPABASE_POOLER_DATABASE_URL must be the application role's pooler address, not postgres: " +
        'the server never runs as the administrative role.',
    );
  }
  const make = (role: string, password: string) => {
    const u = new URL(pooler.href);
    u.username = `${role}.${projectRef}`;
    u.password = password;
    u.port = '5432';
    u.search = '';
    return u.href;
  };
  return {
    projectRef,
    admin: make('postgres', decodeURIComponent(direct.password)),
    app: make(appRole, decodeURIComponent(pooler.password)),
    migrator: make('erp_migrator', migratorPassword),
  };
}

/** The role name and password inside one of the URLs above. */
export function credentialsOf(url: string): { role: string; password: string } {
  const u = new URL(url);
  return {
    role: decodeURIComponent(u.username).split('.')[0] ?? '',
    password: decodeURIComponent(u.password),
  };
}

/** The phrase an operator types, naming the project so the wrong one is not rebuilt. */
export const confirmationFor = (projectRef: string) => `REBUILD ${projectRef}`;

export function parseConfirm(args: string[]): string | undefined {
  const i = args.indexOf('--confirm');
  return i >= 0 ? args[i + 1] : undefined;
}

/** Tables the migration chain seeds itself; rows there are nobody's data. */
export const SEEDED_TABLES: ReadonlySet<string> = new Set([
  'schema_migrations',
  'permissions',
  'role_definitions',
]);

/** Tables holding anything a person put there, which makes a rebuild refuse. */
export function tablesHoldingData(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([table, n]) => n > 0 && !SEEDED_TABLES.has(table))
    .map(([table]) => table)
    .sort();
}

const SWITCHED = ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'BOOTSTRAP_DATABASE_URL'] as const;

/**
 * Points the three connections at Supabase. The local values are kept once, as
 * `LOCAL_<KEY>`, so going back is a rename rather than a search through history.
 */
export function rewriteEnv(text: string, urls: Pick<SupabaseUrls, 'admin' | 'app' | 'migrator'>): string {
  const lines = text.split('\n');
  const index = (key: string) => lines.findIndex((l) => l.startsWith(`${key}=`));
  const get = (key: string) => lines[index(key)]?.slice(key.length + 1);
  const set = (key: string, value: string) => {
    const i = index(key);
    if (i >= 0) lines[i] = `${key}=${value}`;
    else if (lines.at(-1) === '') lines.splice(lines.length - 1, 0, `${key}=${value}`);
    else lines.push(`${key}=${value}`);
  };
  const values = {
    DATABASE_URL: urls.app,
    MIGRATION_DATABASE_URL: urls.migrator,
    BOOTSTRAP_DATABASE_URL: urls.admin,
  };
  for (const key of SWITCHED) {
    const current = get(key);
    if (current !== undefined && get(`LOCAL_${key}`) === undefined && !current.includes('supabase')) {
      set(`LOCAL_${key}`, current);
    }
    set(key, values[key]);
  }
  return lines.join('\n');
}

/** Drops every table and every non-extension function in public. */
export const DROP_PUBLIC_SQL = `
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS f
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
     WHERE n.nspname = 'public' AND d.objid IS NULL
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.f);
  END LOOP;
END $$;`;

/** Row counts for every table in public, in one round trip. */
export const COUNT_PUBLIC_SQL = `
SELECT table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text AS n
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

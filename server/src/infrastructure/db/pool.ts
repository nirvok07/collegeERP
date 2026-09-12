import pg from 'pg';

/**
 * A calendar date is not an instant, and the driver disagrees by default.
 *
 * `pg` parses a DATE column into a JavaScript Date at LOCAL midnight, so
 * '2026-09-12' read in India becomes 2026-09-11T18:30:00Z. Anything that then
 * formats it through toISOString, which is the only safe way to format a Date,
 * reports the previous day. Academic year, term and class session dates were all
 * exposed to that.
 *
 * The fix belongs here, at the one place the driver is configured: DATE (oid
 * 1082) is handed back as the text PostgreSQL sent, which is already ISO
 * 'YYYY-MM-DD'. Timestamps are untouched, because an instant genuinely is one.
 */
pg.types.setTypeParser(1082, (value) => value);

/**
 * Standard PostgreSQL over DATABASE_URL. No vendor SDK, so the same code runs
 * against Supabase-hosted PostgreSQL in development and managed PostgreSQL in
 * production; moving between them is a configuration change.
 */
export function createPool(databaseUrl: string): pg.Pool {
  const needsTls = /supabase|amazonaws|render|neon|\bsslmode=require\b/.test(databaseUrl);
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...(needsTls ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

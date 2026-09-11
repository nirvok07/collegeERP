import pg from 'pg';

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

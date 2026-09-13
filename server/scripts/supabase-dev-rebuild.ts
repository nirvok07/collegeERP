/**
 * AD-68: rebuilds the Supabase development database from the migration chain,
 * then points server/.env at it. Operator use only.
 *
 *   npm run db:supabase:rebuild -- --confirm "REBUILD <project-ref>"
 *
 * Destructive: drops every table and function in Supabase's public schema.
 * It refuses in production, without the exact confirmation, and whenever any
 * table holds data beyond what the migrations seed, so it can only ever clear
 * an empty or stale schema. Reads SUPABASE_DB_URL (the postgres password) and
 * SUPABASE_POOLER_DATABASE_URL (the application role) from server/.env and
 * never prints a secret. `npm test` is unaffected: it keeps college_erp_test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/infrastructure/db/pool.ts';
import { bootstrapRoles, migrate } from '../src/infrastructure/db/migrate.ts';
import {
  COUNT_PUBLIC_SQL,
  DROP_PUBLIC_SQL,
  confirmationFor,
  credentialsOf,
  parseConfirm,
  rewriteEnv,
  supabaseUrls,
  tablesHoldingData,
} from '../src/infrastructure/db/supabase-dev.ts';

if (process.env.NODE_ENV === 'production') {
  console.error('Refused: development tooling only.');
  process.exit(2);
}
const { SUPABASE_DB_URL, SUPABASE_POOLER_DATABASE_URL } = process.env;
if (!SUPABASE_DB_URL || !SUPABASE_POOLER_DATABASE_URL) {
  console.error('Set SUPABASE_DB_URL and SUPABASE_POOLER_DATABASE_URL in server/.env first.');
  process.exit(2);
}

const urls = supabaseUrls(SUPABASE_DB_URL, SUPABASE_POOLER_DATABASE_URL);
const expected = confirmationFor(urls.projectRef);
if (parseConfirm(process.argv.slice(2)) !== expected) {
  console.error(
    `This drops every table and function in the public schema of Supabase project ` +
      `${urls.projectRef} and rebuilds it from the migrations.\n` +
      `Re-run with: npm run db:supabase:rebuild -- --confirm "${expected}"`,
  );
  process.exit(2);
}

const admin = createPool(urls.admin);
try {
  const { rows } = await admin.query<{ table_name: string; n: string }>(COUNT_PUBLIC_SQL);
  const holding = tablesHoldingData(Object.fromEntries(rows.map((r) => [r.table_name, Number(r.n)])));
  if (holding.length > 0) {
    console.error(`Refused: these tables hold data: ${holding.join(', ')}. Nothing was changed.`);
    process.exit(1);
  }
  await admin.query(DROP_PUBLIC_SQL);
  console.log(`cleared ${rows.length} tables from public`);
} finally {
  await admin.end();
}

const app = credentialsOf(urls.app);
const migrator = credentialsOf(urls.migrator);
await bootstrapRoles(urls.admin, {
  appRole: app.role,
  appPassword: app.password,
  migratorRole: migrator.role,
  migratorPassword: migrator.password,
});
await migrate(urls.migrator, console.log, app.role);

// The server's own path: the application role, through the pooler, under RLS.
const check = createPool(urls.app);
try {
  const { rows } = await check.query<{ who: string }>('SELECT current_user AS who');
  console.log(`application connects as ${rows[0].who}`);
} finally {
  await check.end();
}

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
writeFileSync(envPath, rewriteEnv(readFileSync(envPath, 'utf8'), urls), { mode: 0o600 });
console.log(
  'server/.env now points at Supabase (local values kept as LOCAL_*).\n' +
    'Next: npm run dev, then create test data (npm run seed:device-test, after moving the old ' +
    '.device-test.local.json aside, since it holds the local database credentials).',
);

/**
 * Bootstrap only: provision roles, apply no migrations.
 *
 * The same code path `npm run migrate` uses when BOOTSTRAP_DATABASE_URL is set,
 * exposed as its own command so the instruction in an error message names
 * something a developer can actually run. There is deliberately no second
 * role-creation implementation.
 */
import { loadConfig } from '../../config/config.ts';
import { bootstrapRoles, rolesFromUrls } from './migrate.ts';

const config = loadConfig();

if (!config.BOOTSTRAP_DATABASE_URL) {
  console.error(
    'BOOTSTRAP_DATABASE_URL is not set. It must be an administrative connection ' +
      '(a superuser locally, or the postgres role on managed PostgreSQL) to the target database.',
  );
  process.exit(1);
}

await bootstrapRoles(
  config.BOOTSTRAP_DATABASE_URL,
  rolesFromUrls(config.DATABASE_URL, config.MIGRATION_DATABASE_URL, {
    appRole: process.env.APP_DB_ROLE,
    migratorRole: process.env.MIGRATOR_DB_ROLE,
  }),
);
console.log('roles provisioned');

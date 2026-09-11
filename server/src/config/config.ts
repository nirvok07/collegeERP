import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  /** Migrations own the schema; the application never does. */
  MIGRATION_DATABASE_URL: z.string().min(1),
  /**
   * Administrative connection used once, before migrations, to provision roles.
   * Optional: when absent, roles are expected to exist already (scripts/setup-db.sh).
   */
  BOOTSTRAP_DATABASE_URL: z.string().optional(),
  APP_DB_ROLE: z.string().default('erp_app'),
  MIGRATOR_DB_ROLE: z.string().default('erp_migrator'),
  /** Comma-separated origins allowed to call the API from a browser. */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4173'),
  /** Signs the refresh cookie. Distinct from JWT_SECRET so they rotate independently. */
  COOKIE_SECRET: z.string().min(32),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse({
    ...env,
    // Local development defaults. Production supplies real values and the
    // schema refuses to start without them.
    DATABASE_URL:
      env.DATABASE_URL ?? 'postgres://erp_app:erp_app_local@localhost:5432/college_erp_dev',
    JWT_SECRET: env.JWT_SECRET ?? 'dev-only-secret-not-for-production-use-32b',
    COOKIE_SECRET: env.COOKIE_SECRET ?? env.JWT_SECRET ?? 'dev-only-cookie-secret-not-for-production',
    MIGRATION_DATABASE_URL:
      env.MIGRATION_DATABASE_URL ??
      'postgres://erp_migrator:erp_migrator_local@localhost:5432/college_erp_dev',
  });
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be supplied explicitly in production');
  }
  return parsed.data;
}

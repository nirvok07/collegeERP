import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  /** Migrations run with a role that may bypass RLS; the application never can. */
  MIGRATION_DATABASE_URL: z.string().min(1),
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

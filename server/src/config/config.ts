import { z } from 'zod';
import {
  AesGcmSealer, parseRetiredKeys, parseSealingKey, type SecretSealer,
} from '../infrastructure/crypto/secret-sealer.ts';
import { createHash } from 'node:crypto';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Sliding (AD-25): counted from the last renewal, so a year of not opening the app. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(365),
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
  /**
   * AD-63. Seals secrets the server must read back (TOTP). 32 bytes, base64.
   * Its own key: never the JWT or cookie secret, never in the database.
   */
  SECRET_SEALING_KEY: z.string().optional(),
  SECRET_SEALING_KEY_ID: z.string().default('k1'),
  /** Retired keys that may still open old values: `id:base64,id:base64`. */
  SECRET_SEALING_RETIRED_KEYS: z.string().optional(),
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
  // AD-63: production never starts without a valid sealing key. Elsewhere an
  // explicitly insecure development key is used and announced (see sealerFor).
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.SECRET_SEALING_KEY) {
    throw new Error('SECRET_SEALING_KEY must be supplied in production');
  }
  if (parsed.data.SECRET_SEALING_KEY) {
    parseSealingKey(parsed.data.SECRET_SEALING_KEY_ID, parsed.data.SECRET_SEALING_KEY, 'SECRET_SEALING_KEY');
  }
  parseRetiredKeys(parsed.data.SECRET_SEALING_RETIRED_KEYS);
  return parsed.data;
}

/** Key id of the development key. A value sealed under it never opens in production. */
export const DEV_SEALING_KEY_ID = 'dev-insecure';

/**
 * The sealer for this configuration. Without a configured key, outside
 * production only, a fixed and publicly known development key is used and a
 * warning printed, so nobody mistakes it for protection.
 */
export function sealerFor(config: Config, warn: (m: string) => void = console.warn): SecretSealer {
  const retired = parseRetiredKeys(config.SECRET_SEALING_RETIRED_KEYS);
  if (config.SECRET_SEALING_KEY) {
    return new AesGcmSealer(
      parseSealingKey(config.SECRET_SEALING_KEY_ID, config.SECRET_SEALING_KEY, 'SECRET_SEALING_KEY'),
      retired,
    );
  }
  if (config.NODE_ENV === 'production') throw new Error('SECRET_SEALING_KEY must be supplied in production');
  warn('SECRET_SEALING_KEY is not set: sealing with the insecure development key. Never use this in production.');
  const devKey = createHash('sha256').update('college-erp development sealing key, not a secret').digest();
  return new AesGcmSealer({ id: DEV_SEALING_KEY_ID, key: devKey }, retired);
}

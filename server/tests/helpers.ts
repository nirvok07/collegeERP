import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/config.ts';
import { buildContainer, type Container } from '../src/container.ts';
import { buildServer } from '../src/infrastructure/http/server.ts';
import { migrate } from '../src/infrastructure/db/migrate.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';
import { ScryptPasswordHasher } from '../src/infrastructure/crypto/adapters.ts';
import type { LightMyRequestResponse } from 'fastify';

process.env.NODE_ENV = 'test';

export const TEST_DB = process.env.TEST_DB_NAME ?? 'college_erp_test';
const host = 'localhost:5432';
export const APP_URL = `postgres://erp_app:erp_app_local@${host}/${TEST_DB}`;
export const MIGRATOR_URL = `postgres://erp_migrator:erp_migrator_local@${host}/${TEST_DB}`;

export async function setupDatabase(): Promise<void> {
  await migrate(MIGRATOR_URL, () => {});
}

/**
 * Truncates between tests, using the migrator role since the application role
 * has no DELETE anywhere.
 *
 * TRUNCATE ... CASCADE reaches role_definitions through its institution foreign
 * key, which removes the platform role templates as collateral, so the seed is
 * reapplied afterwards.
 */
export async function resetData(): Promise<void> {
  const pool = createPool(MIGRATOR_URL);
  try {
    await pool.query(`
      TRUNCATE audit_events, login_attempts, refresh_tokens, invitation_tokens,
               credentials, role_assignments, user_accounts, persons,
               departments, campuses, institutions, platform_accounts
      RESTART IDENTITY CASCADE`);
    const seed = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../migrations/002_seed_platform_reference.sql'),
      'utf8',
    );
    await pool.query(seed);
  } finally {
    await pool.end();
  }
}

export function testConfig() {
  return loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: APP_URL,
    MIGRATION_DATABASE_URL: MIGRATOR_URL,
    JWT_SECRET: 'test-secret-value-long-enough-for-schema',
  } as NodeJS.ProcessEnv);
}

export async function buildTestApp() {
  const container = buildContainer(testConfig());
  const app = await buildServer(container);
  return {
    app,
    container,
    async close() {
      await app.close();
      await container.close();
    },
  };
}

/** Creates a platform account directly: there is no endpoint that creates one. */
export async function seedPlatformAccount(
  email = 'owner@nirvok.com',
  password = 'platform-pass-123',
): Promise<{ id: string; email: string; password: string }> {
  const pool = createPool(MIGRATOR_URL);
  const id = randomUUID();
  try {
    const hash = await new ScryptPasswordHasher().hash(password);
    await pool.query(
      `INSERT INTO platform_accounts (id, email, full_name, credential_hash, status)
       VALUES ($1,$2,$3,$4,'active')`,
      [id, email, 'Platform Owner', hash],
    );
  } finally {
    await pool.end();
  }
  return { id, email, password };
}

export async function signInPlatform(
  app: TestApp['app'],
  email: string,
  password: string,
): Promise<{ status: number; body: any }> {
  const res = (await app.inject({
    method: 'POST', url: '/v1/auth/platform/login', payload: { email, password },
  })) as LightMyRequestResponse;
  return { status: res.statusCode, body: res.json() };
}

export async function provisionCollege(
  app: TestApp['app'],
  accessToken: string,
  overrides: Partial<{ code: string; name: string; adminEmail: string }> = {},
): Promise<{ status: number; body: any }> {
  const res = (await app.inject({
    method: 'POST',
    url: '/v1/institutions',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      code: overrides.code ?? 'test-college',
      name: overrides.name ?? 'Test College of Engineering',
      admin: {
        full_name: 'Priya Sharma',
        email: overrides.adminEmail ?? 'priya@testcollege.edu',
      },
    },
  })) as LightMyRequestResponse;
  return { status: res.statusCode, body: res.json() };
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
export type { Container };

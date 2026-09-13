import { randomUUID } from 'node:crypto';
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
 * Clears tenant data between tests.
 *
 * Deliberately NOT `TRUNCATE ... CASCADE`: that reached platform role templates
 * through the institution foreign key and destroyed them, so every later
 * migration that amends a template silently lost its effect on the next reset.
 * Deleting tenant-owned rows in dependency order leaves the platform catalogue
 * exactly as the migration chain left it.
 */
export async function resetData(): Promise<void> {
  const pool = createPool(MIGRATOR_URL);
  try {
    // Leaf to root. Most foreign keys are ON DELETE RESTRICT by design, so this
    // order is the dependency graph rather than a convenience.
    //
    // Organisational units are removed before persons, because they carry
    // `archived_by` and `published_by` references. Nulling those instead would
    // be both unnecessary and, for a published curriculum version, correctly
    // refused by its immutability trigger.
    for (const table of [
      // A cache of outcomes that references persons, so it goes first.
      'idempotency_keys',
      'audit_events', 'login_attempts', 'refresh_tokens', 'invitation_tokens',
      'devices', 'credentials', 'role_assignments',
      // Attendance references a class session, so it goes before delivery.
      'attendance_corrections', 'attendance_records', 'attendance_sheets',
      // Assessment references offerings and students, so it goes before both.
      'assessment_mark_corrections', 'assessment_marks', 'assessment_components',
      // Delivery references offerings and rooms, so it goes before both.
      'class_sessions', 'timetable_slots', 'non_teaching_days',
      // Enrolment references offerings, sections, students and persons.
      'offering_enrolments', 'section_memberships', 'students',
      // Teaching references courses and sections, so it goes before both.
      'instructor_assignments', 'course_offerings',
      'curriculum_entries', 'curriculum_versions', 'courses',
      'sections', 'terms', 'academic_years',
      'programs', 'departments', 'rooms', 'campuses',
      'user_accounts', 'persons',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }

    // Tenant-cloned roles only. Platform templates carry no tenant and stay.
    await pool.query(`DELETE FROM role_definitions WHERE tenant_id IS NOT NULL`);
    await pool.query(`DELETE FROM institutions`);
    // Role assignments reference platform accounts (migration 021).
    await pool.query(`DELETE FROM platform_role_assignments`);
    await pool.query(`DELETE FROM platform_accounts`);
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
  role: 'owner' | 'support' = 'owner',
): Promise<{ id: string; email: string; password: string }> {
  const pool = createPool(MIGRATOR_URL);
  const id = randomUUID();
  try {
    const hash = await new ScryptPasswordHasher().hash(password);
    await pool.query(
      `INSERT INTO platform_accounts (id, email, full_name, credential_hash, status)
       VALUES ($1,$2,$3,$4,'active')`,
      [id, email, role === 'owner' ? 'Platform Owner' : 'Platform Support', hash],
    );
    // Operator bootstrap, as migration 021 documents: the role is granted with
    // no granting account.
    await pool.query(
      `INSERT INTO platform_role_assignments (id, platform_account_id, role, reason)
       VALUES ($1, $2, $3, 'Test bootstrap')`,
      [randomUUID(), id, role],
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

/**
 * AD-22. Isolation is enforced twice: in the data access layer, and again by row
 * level security. These tests attack the second layer directly, bypassing the
 * application entirely, because a test that only exercises the repository proves
 * the weaker of the two guarantees.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_URL, buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;

before(async () => {
  await setupDatabase();
  harness = await buildTestApp();
});
after(async () => harness.close());
beforeEach(resetData);

async function twoColleges() {
  const account = await seedPlatformAccount();
  const login = await signInPlatform(harness.app, account.email, account.password);
  const token = login.body.data.access_token as string;

  const a = await provisionCollege(harness.app, token, {
    code: 'alpha-college', name: 'Alpha College', adminEmail: 'admin@alpha.edu',
  });
  const b = await provisionCollege(harness.app, token, {
    code: 'beta-college', name: 'Beta College', adminEmail: 'admin@beta.edu',
  });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  return {
    token,
    alpha: { id: a.body.data.institution.id as string, personId: a.body.data.administrator.person_id as string },
    beta: { id: b.body.data.institution.id as string, personId: b.body.data.administrator.person_id as string },
  };
}

describe('tenant isolation under row level security', () => {
  it('a query scoped to one tenant cannot see another tenant rows, even with no WHERE clause', async () => {
    const { alpha, beta } = await twoColleges();
    const pool = createPool(APP_URL);
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', alpha.id]);

        const persons = await client.query('SELECT id, tenant_id FROM persons');
        assert.equal(persons.rowCount, 1, 'only Alpha rows are visible');
        assert.equal(persons.rows[0].tenant_id, alpha.id);

        // Ask for Beta's row by its exact primary key: the strongest form of the attack.
        const direct = await client.query('SELECT id FROM persons WHERE id = $1', [beta.personId]);
        assert.equal(direct.rowCount, 0, 'a known Beta id is invisible from Alpha context');

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('a tenant cannot write a row belonging to another tenant', async () => {
    const { alpha, beta } = await twoColleges();
    const pool = createPool(APP_URL);
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', alpha.id]);
        await assert.rejects(
          client.query(
            `INSERT INTO persons (id, tenant_id, full_name, person_type, status)
             VALUES (gen_random_uuid(), $1, 'Injected', 'staff', 'provisional')`,
            [beta.id],
          ),
          /row-level security/i,
          'WITH CHECK refuses a cross-tenant insert',
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('an update cannot move a row into another tenant', async () => {
    const { alpha, beta } = await twoColleges();
    const pool = createPool(APP_URL);
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', alpha.id]);
        await assert.rejects(
          client.query('UPDATE persons SET tenant_id = $1 WHERE id = $2', [beta.id, alpha.personId]),
          /row-level security/i,
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('with no tenant context set, no tenant-owned row is readable', async () => {
    await twoColleges();
    const pool = createPool(APP_URL);
    try {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM persons');
      assert.equal(rows[0].n, 0, 'absent context reveals nothing rather than everything');
    } finally {
      await pool.end();
    }
  });

  it('the application role cannot bypass row level security', async () => {
    const pool = createPool(APP_URL);
    try {
      const { rows } = await pool.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      assert.equal(rows[0].rolsuper, false, 'a superuser would bypass RLS unconditionally');
      assert.equal(rows[0].rolbypassrls, false);
    } finally {
      await pool.end();
    }
  });

  it('the application role holds no DELETE grant on any table', async () => {
    const pool = createPool(APP_URL);
    try {
      const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.role_table_grants
          WHERE grantee = 'erp_app' AND privilege_type = 'DELETE'`,
      );
      assert.equal(rows.length, 0, 'AD-8 and BR-17: soft delete only, nothing is removed');
    } finally {
      await pool.end();
    }
  });

  it('audit and login attempts are append-only for the application role', async () => {
    const pool = createPool(APP_URL);
    try {
      const { rows } = await pool.query(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'erp_app' AND table_name IN ('audit_events','login_attempts')
            AND privilege_type IN ('UPDATE','DELETE')`,
      );
      assert.equal(rows.length, 0, 'history cannot be rewritten through the application');
    } finally {
      await pool.end();
    }
  });

  it('one login identifier may exist in two institutions, per BR-3', async () => {
    const account = await seedPlatformAccount();
    const login = await signInPlatform(harness.app, account.email, account.password);
    const token = login.body.data.access_token as string;
    const shared = 'consultant@example.edu';

    const a = await provisionCollege(harness.app, token, {
      code: 'gamma-college', name: 'Gamma College', adminEmail: shared,
    });
    const b = await provisionCollege(harness.app, token, {
      code: 'delta-college', name: 'Delta College', adminEmail: shared,
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201, 'uniqueness is per tenant, not global');
    assert.notEqual(a.body.data.administrator.person_id, b.body.data.administrator.person_id);
  });
});

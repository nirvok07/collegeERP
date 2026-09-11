/**
 * W0 — tenant provisioning. These tests defend AD-20, AD-21, BR-25 and BR-26.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;

before(async () => {
  await setupDatabase();
  harness = await buildTestApp();
});
after(async () => harness.close());
beforeEach(resetData);

async function platformToken() {
  const account = await seedPlatformAccount();
  const res = await signInPlatform(harness.app, account.email, account.password);
  assert.equal(res.status, 200);
  return { token: res.body.data.access_token as string, account };
}

describe('W0 provision a college with its initial administrator', () => {
  it('creates institution, campus, person, account, assignment and invitation in one call', async () => {
    const { token } = await platformToken();
    const res = await provisionCollege(harness.app, token);

    assert.equal(res.status, 201);
    assert.equal(res.body.data.institution.code, 'test-college');
    assert.equal(res.body.data.institution.status, 'trial');
    assert.ok(res.body.data.administrator.person_id);
    assert.ok(res.body.data.administrator.account_id);
    assert.ok(res.body.data.invitation.token);
    assert.equal(res.body.data.invitation.delivery, 'pending');

    const pool = createPool(MIGRATOR_URL);
    try {
      const tenantId = res.body.data.institution.id;
      const counts = await pool.query(
        `SELECT
           (SELECT count(*) FROM campuses WHERE tenant_id = $1)         AS campuses,
           (SELECT count(*) FROM persons WHERE tenant_id = $1)          AS persons,
           (SELECT count(*) FROM user_accounts WHERE tenant_id = $1)    AS accounts,
           (SELECT count(*) FROM role_assignments WHERE tenant_id = $1) AS assignments,
           (SELECT count(*) FROM invitation_tokens WHERE tenant_id = $1) AS invitations`,
        [tenantId],
      );
      const row = counts.rows[0];
      assert.equal(Number(row.campuses), 1, 'a default campus exists, per AD-2');
      assert.equal(Number(row.persons), 1);
      assert.equal(Number(row.accounts), 1);
      assert.equal(Number(row.assignments), 1);
      assert.equal(Number(row.invitations), 1);
    } finally {
      await pool.end();
    }
  });

  it('AD-21: authority comes from the assignment, with no admin pointer on the institution', async () => {
    const { token } = await platformToken();
    const res = await provisionCollege(harness.app, token);
    const tenantId = res.body.data.institution.id;

    const pool = createPool(MIGRATOR_URL);
    try {
      const columns = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'institutions'`,
      );
      const names = columns.rows.map((r) => r.column_name);
      for (const forbidden of ['admin_user_id', 'admin_id', 'primary_admin_id', 'owner_id']) {
        assert.ok(!names.includes(forbidden), `institutions must not carry ${forbidden}`);
      }

      const assignment = await pool.query(
        `SELECT rd.key, ra.scope_type, ra.source, ra.granted_by_platform
           FROM role_assignments ra JOIN role_definitions rd ON rd.id = ra.role_id
          WHERE ra.tenant_id = $1`,
        [tenantId],
      );
      assert.equal(assignment.rows[0].key, 'college_admin');
      assert.equal(assignment.rows[0].scope_type, 'institution');
      assert.equal(assignment.rows[0].source, 'bootstrap', 'BR-25: distinguishable from an ordinary grant');
      assert.ok(assignment.rows[0].granted_by_platform, 'authorised by platform authority');
    } finally {
      await pool.end();
    }
  });

  it('AD-20: a failure part-way through leaves no institution behind', async () => {
    const { token } = await platformToken();
    const first = await provisionCollege(harness.app, token, { adminEmail: 'clash@x.edu' });
    assert.equal(first.status, 201);

    // Same code: the institution insert fails after validation passes.
    const second = await provisionCollege(harness.app, token, { adminEmail: 'other@x.edu' });
    assert.equal(second.status, 409);

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM institutions`);
      assert.equal(rows[0].n, 1, 'the rejected attempt created nothing');
      const orphans = await pool.query(
        `SELECT count(*)::int AS n FROM institutions i
          WHERE NOT EXISTS (SELECT 1 FROM role_assignments ra
                             WHERE ra.tenant_id = i.id AND ra.status = 'active')`,
      );
      assert.equal(orphans.rows[0].n, 0, 'no institution exists without an administrator');
    } finally {
      await pool.end();
    }
  });

  it('BR-26: bootstrap applies only while the institution has no administrator', async () => {
    const { token } = await platformToken();
    await provisionCollege(harness.app, token);
    const repeat = await provisionCollege(harness.app, token, { adminEmail: 'second@x.edu' });
    assert.equal(repeat.status, 409, 'the second attempt is refused, not silently duplicated');
  });

  it('rejects an invalid institution code with field-level errors', async () => {
    const { token } = await platformToken();
    const res = await harness.app.inject({
      method: 'POST',
      url: '/v1/institutions',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: 'A B', name: 'X College', admin: { full_name: 'A B', email: 'a@b.edu' } },
    });
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.code, 'VALIDATION_FAILED');
    assert.ok(res.json().error.field_errors);
  });

  it('records an audit trail for provisioning under one correlation id', async () => {
    const { token, account } = await platformToken();
    const res = await provisionCollege(harness.app, token);
    const tenantId = res.body.data.institution.id;

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT action, actor_type, actor_id, correlation_id FROM audit_events
          WHERE tenant_id = $1 ORDER BY at`,
        [tenantId],
      );
      const actions = rows.map((r) => r.action);
      for (const expected of ['person.created', 'account.invited', 'assignment.granted', 'institution.provisioned']) {
        assert.ok(actions.includes(expected), `missing audit event ${expected}`);
      }
      assert.equal(new Set(rows.map((r) => r.correlation_id)).size, 1, 'one correlation id for one business act');
      assert.ok(rows.every((r) => r.actor_type === 'platform' && r.actor_id === account.id));
    } finally {
      await pool.end();
    }
  });
});

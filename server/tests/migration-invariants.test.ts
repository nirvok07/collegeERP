/**
 * Invariants of the database privilege model.
 *
 * These exist because privileges are the one part of the system that no amount
 * of application code review can verify: they live in the database, and a
 * migration that widens them looks like an ordinary GRANT in a diff.
 *
 * THE INVARIANT FOR NEW TABLES
 * ----------------------------
 * Default privileges are deliberately NOT used. A blanket
 * `ALTER DEFAULT PRIVILEGES ... GRANT` would give every future table the same
 * privilege set, which is wrong for this schema: audit tables must receive
 * INSERT and SELECT only, and reference tables SELECT only. A default would
 * hand a future audit-shaped table INSERT and UPDATE, silently dissolving the
 * append-only guarantee, and the grant would be invisible in the migration.
 *
 * So every application table declares its runtime privileges explicitly in the
 * migration that creates it. `EXPECTED_PRIVILEGES` below is the declaration of
 * record. Adding a table without adding a line here fails this suite, which is
 * the enforcement: a new table cannot reach the application by accident, and
 * widening an existing table's privileges cannot pass unnoticed.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APP_URL, MIGRATOR_URL, setupDatabase } from './helpers.ts';
import { createPool, type Pool } from '../src/infrastructure/db/pool.ts';
import { assertApplicationRole } from '../src/infrastructure/db/migrate.ts';

const APP_ROLE = 'erp_app';

/** The privilege model, declared. Update deliberately, never to make a test pass. */
const EXPECTED_PRIVILEGES: Record<string, string> = {
  // Tenant data the application creates and amends. No DELETE anywhere: records
  // are soft-deleted so tombstones propagate and audit references resolve.
  campuses: 'INSERT+SELECT+UPDATE',
  credentials: 'INSERT+SELECT+UPDATE',
  departments: 'INSERT+SELECT+UPDATE',
  institutions: 'INSERT+SELECT+UPDATE',
  invitation_tokens: 'INSERT+SELECT+UPDATE',
  persons: 'INSERT+SELECT+UPDATE',
  refresh_tokens: 'INSERT+SELECT+UPDATE',
  role_assignments: 'INSERT+SELECT+UPDATE',
  role_definitions: 'INSERT+SELECT+UPDATE',
  user_accounts: 'INSERT+SELECT+UPDATE',

  // Append-only. The audit writer has no update method; this is what enforces it.
  audit_events: 'INSERT+SELECT',
  login_attempts: 'INSERT+SELECT',

  // Platform-owned reference data. The application composes from it, never writes it.
  permissions: 'SELECT',

  // Platform accounts are created by an operator, never by a request path, so
  // no INSERT: no endpoint can mint one.
  platform_accounts: 'SELECT+UPDATE',

  // Push registrations. No DELETE: revocation is a visible state, so a device
  // that was signed out of stays in the register.
  devices: 'INSERT+SELECT+UPDATE',

  // Curriculum spine. Immutability of published versions is enforced by
  // trigger, not by withholding UPDATE, because superseding is a legitimate
  // transition that the trigger permits and everything else it refuses.
  programs: 'INSERT+SELECT+UPDATE',
  courses: 'INSERT+SELECT+UPDATE',
  curriculum_versions: 'INSERT+SELECT+UPDATE',
  // The one table with DELETE: a draft is edited by removing entries, and the
  // trigger confines deletion to drafts.
  curriculum_entries: 'DELETE+INSERT+SELECT+UPDATE',

  // Academic calendar and teaching groups. No DELETE: a section is cancelled,
  // never removed, because attendance and results reference it by identity.
  academic_years: 'INSERT+SELECT+UPDATE',
  terms: 'INSERT+SELECT+UPDATE',
  sections: 'INSERT+SELECT+UPDATE',

  // Teaching. No DELETE: an offering is cancelled and an assignment is ended,
  // because attendance and results will reference both by identity.
  course_offerings: 'INSERT+SELECT+UPDATE',
  instructor_assignments: 'INSERT+SELECT+UPDATE',

  // Teaching delivery. No DELETE: a room is archived, a slot removed, a class
  // cancelled, because attendance will reference the class and the rest carries
  // the provenance of what produced it.
  rooms: 'INSERT+SELECT+UPDATE',
  timetable_slots: 'INSERT+SELECT+UPDATE',
  class_sessions: 'INSERT+SELECT+UPDATE',
  // The second table with DELETE: a mistyped holiday is a typo, not history.
  // Nothing references a non-teaching day and generation reads it live.
  non_teaching_days: 'DELETE+INSERT+SELECT+UPDATE',

  // Student records. No DELETE: a placement is ended and a student is
  // withdrawn, because attendance and results reference both by identity.
  students: 'INSERT+SELECT+UPDATE',
  section_memberships: 'INSERT+SELECT+UPDATE',
  offering_enrolments: 'INSERT+SELECT+UPDATE',

  // Attendance. Sheets and marks are amended while a register is open, and the
  // triggers decide what an UPDATE may actually do.
  attendance_sheets: 'INSERT+SELECT+UPDATE',
  attendance_records: 'INSERT+SELECT+UPDATE',
  // Append-only, like the audit log: a correction's history cannot be rewritten
  // by any code path, because no code path holds the privilege to try.
  attendance_corrections: 'INSERT+SELECT',

  // Internal assessment. Components and marks are amended while a sheet is
  // open, and the triggers decide what an UPDATE may do. No DELETE anywhere:
  // a component is cancelled, and marks stay because results will cite them.
  assessment_components: 'INSERT+SELECT+UPDATE',
  assessment_marks: 'INSERT+SELECT+UPDATE',
  // Append-only, like the audit log and attendance corrections.
  assessment_mark_corrections: 'INSERT+SELECT',

  // Replay-safe writes (AD-58). DELETE because this is a cache of outcomes, not
  // history: a server error releases a key and old outcomes expire, and nothing
  // references a row.
  idempotency_keys: 'DELETE+INSERT+SELECT+UPDATE',
};

/** Migration infrastructure, deliberately unreachable from the application. */
const NOT_APPLICATION_DATA = new Set(['schema_migrations']);

let appPool: Pool;
let migratorPool: Pool;

before(async () => {
  await setupDatabase();
  appPool = createPool(APP_URL);
  migratorPool = createPool(MIGRATOR_URL);
});
after(async () => { await appPool.end(); await migratorPool.end(); });

describe('pre-flight bootstrap check', () => {
  it('fails when the application role is absent, before anything is applied', async () => {
    const client = await migratorPool.connect();
    try {
      await assert.rejects(
        assertApplicationRole(client, 'role_that_does_not_exist'),
        (e: Error) => {
          assert.match(e.message, /does not exist/);
          assert.match(e.message, /No migration has been applied/);
          assert.match(e.message, /db:bootstrap/, 'names a command that actually exists');
          return true;
        },
      );
    } finally { client.release(); }
  });

  it('passes when the application role is present', async () => {
    const client = await migratorPool.connect();
    try {
      await assert.doesNotReject(assertApplicationRole(client, APP_ROLE));
    } finally { client.release(); }
  });
});

describe('application role privileges', () => {
  it('every table declares its runtime privileges explicitly', async () => {
    const { rows: tables } = await migratorPool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const { rows: grants } = await migratorPool.query<{ table_name: string; privs: string }>(
      `SELECT table_name, string_agg(privilege_type, '+' ORDER BY privilege_type) AS privs
         FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'public'
        GROUP BY table_name`,
      [APP_ROLE],
    );
    const actual = new Map(grants.map((g) => [g.table_name, g.privs]));

    for (const { tablename } of tables) {
      if (NOT_APPLICATION_DATA.has(tablename)) {
        assert.equal(
          actual.get(tablename), undefined,
          `${tablename} is migration infrastructure and must stay unreachable from the application`,
        );
        continue;
      }
      const expected = EXPECTED_PRIVILEGES[tablename];
      assert.ok(
        expected,
        `Table "${tablename}" has no declared runtime privileges. Add its GRANT to the migration ` +
          `that creates it and record the decision in EXPECTED_PRIVILEGES, or list it in ` +
          `NOT_APPLICATION_DATA if the application must never reach it.`,
      );
      assert.equal(
        actual.get(tablename) ?? 'NONE', expected,
        `Runtime privileges on "${tablename}" differ from the declared model`,
      );
    }

    // And nothing is granted that is not declared.
    for (const table of actual.keys()) {
      assert.ok(EXPECTED_PRIVILEGES[table], `"${table}" holds grants that are not declared`);
    }
  });

  it('holds DELETE only where nothing historical can be lost', async () => {
    const { rows } = await migratorPool.query(
      `SELECT table_name FROM information_schema.role_table_grants
        WHERE grantee = $1 AND privilege_type = 'DELETE'
        ORDER BY table_name`, [APP_ROLE],
    );
    assert.deepEqual(
      rows.map((r) => r.table_name), ['curriculum_entries', 'idempotency_keys', 'non_teaching_days'],
      'every other table soft-deletes, so tombstones propagate and audit resolves',
    );
  });

  it('cannot create objects, own tables, or inherit another role', async () => {
    const { rows } = await migratorPool.query(
      `SELECT has_schema_privilege($1,'public','CREATE') AS can_create,
              (SELECT count(*)::int FROM pg_tables
                WHERE schemaname='public' AND tableowner=$1) AS owned,
              (SELECT count(*)::int FROM pg_auth_members m
                 JOIN pg_roles r ON r.oid = m.member WHERE r.rolname=$1) AS memberships,
              (SELECT rolsuper FROM pg_roles WHERE rolname=$1) AS is_super,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname=$1) AS bypasses_rls`,
      [APP_ROLE],
    );
    const r = rows[0];
    assert.equal(r.can_create, false, 'no schema CREATE');
    assert.equal(r.owned, 0, 'owns no tables');
    assert.equal(r.memberships, 0, 'inherits no other role');
    assert.equal(r.is_super, false);
    assert.equal(r.bypasses_rls, false, 'row level security genuinely constrains it');
  });

  it('audit tables reject UPDATE and DELETE from the application', async () => {
    await assert.rejects(
      appPool.query(`UPDATE audit_events SET action = 'tampered'`), /permission denied/i,
    );
    await assert.rejects(
      appPool.query(`DELETE FROM audit_events`), /permission denied/i,
    );
    await assert.rejects(
      appPool.query(`UPDATE login_attempts SET outcome = 'success'`), /permission denied/i,
    );
  });

  it('no privilege is granted to PUBLIC', async () => {
    const { rows } = await migratorPool.query(
      `SELECT DISTINCT table_name FROM information_schema.role_table_grants
        WHERE grantee = 'PUBLIC' AND table_schema = 'public'`,
    );
    assert.deepEqual(rows, []);
  });

  it('no default privileges exist, so a future table cannot be granted implicitly', async () => {
    const { rows } = await migratorPool.query(`SELECT defaclobjtype FROM pg_default_acl`);
    assert.deepEqual(
      rows, [],
      'Default privileges would give a future table an undeclared privilege set. ' +
        'Grants belong in the migration that creates the table.',
    );
  });
});

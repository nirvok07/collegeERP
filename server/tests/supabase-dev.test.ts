/**
 * AD-68: the Supabase development helpers. Pure, so no network and no database:
 * what matters is which connections are derived, what the rebuild refuses, and
 * that switching server/.env never loses the local values.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmationFor, credentialsOf, parseConfirm, rewriteEnv, supabaseUrls, tablesHoldingData,
} from '../src/infrastructure/db/supabase-dev.ts';

const DIRECT = 'postgresql://postgres:p%40ss@db.abcref.supabase.co:5432/postgres';
const POOLER =
  'postgresql://erp_app.abcref:app-secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require';

describe('supabaseUrls', () => {
  it('derives three session-pooler connections from the two Supabase values', () => {
    const urls = supabaseUrls(DIRECT, POOLER, 'mig-secret');

    assert.equal(urls.projectRef, 'abcref');
    for (const url of [urls.admin, urls.app, urls.migrator]) {
      const u = new URL(url);
      assert.equal(u.hostname, 'aws-0-ap-southeast-1.pooler.supabase.com');
      // Session mode, never transaction mode, which would drop session state.
      assert.equal(u.port, '5432');
      // TLS comes from createPool; a URL sslmode would override it.
      assert.equal(u.search, '');
    }
    assert.equal(new URL(urls.admin).username, 'postgres.abcref');
    assert.deepEqual(credentialsOf(urls.admin), { role: 'postgres', password: 'p@ss' });
    assert.deepEqual(credentialsOf(urls.app), { role: 'erp_app', password: 'app-secret' });
    assert.deepEqual(credentialsOf(urls.migrator), { role: 'erp_migrator', password: 'mig-secret' });
  });

  it('reads a password ending in an unencoded @, as Supabase dashboards produce', () => {
    // `postgres:secret@@db…`: the userinfo ends at the last @, so the first one
    // belongs to the password. psql cannot parse this form; the URL parser can.
    const urls = supabaseUrls('postgresql://postgres:secret@@db.abcref.supabase.co:5432/postgres', POOLER, 'm');
    assert.equal(credentialsOf(urls.admin).password, 'secret@');
    assert.match(urls.admin, /:secret%40@aws-0/);
  });

  it('generates a migrator password when none is given', () => {
    const { password } = credentialsOf(supabaseUrls(DIRECT, POOLER).migrator);
    assert.match(password, /^[0-9a-f]{48}$/);
  });

  it('refuses a pooler address without a project ref, or one for the postgres role', () => {
    assert.throws(() => supabaseUrls(DIRECT, 'postgresql://erp_app:x@host:5432/postgres'), /project-ref/);
    assert.throws(
      () => supabaseUrls(DIRECT, 'postgresql://postgres.abcref:x@host:5432/postgres'),
      /not postgres/,
    );
  });
});

describe('rebuild guard', () => {
  it('needs the exact phrase naming the project', () => {
    assert.equal(confirmationFor('abcref'), 'REBUILD abcref');
    assert.equal(parseConfirm(['--confirm', 'REBUILD abcref']), 'REBUILD abcref');
    assert.equal(parseConfirm(['--confirm']), undefined);
    assert.equal(parseConfirm([]), undefined);
  });

  it("treats only rows the migrations seed as nobody's data", () => {
    assert.deepEqual(
      tablesHoldingData({ role_definitions: 3, permissions: 40, schema_migrations: 23, institutions: 0 }),
      [],
    );
    assert.deepEqual(
      tablesHoldingData({ students: 2, institutions: 1, role_definitions: 3 }),
      ['institutions', 'students'],
    );
  });
});

describe('rewriteEnv', () => {
  const urls = supabaseUrls(DIRECT, POOLER, 'mig-secret');
  const local =
    'NODE_ENV=development\n' +
    'DATABASE_URL=postgres://erp_app:l@localhost:5432/college_erp_dev\n' +
    'MIGRATION_DATABASE_URL=postgres://erp_migrator:m@localhost:5432/college_erp_dev\n' +
    'JWT_SECRET=s\n';

  it('switches the three connections and keeps the local values', () => {
    const after = rewriteEnv(local, urls);
    const value = (key: string) => after.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];

    assert.equal(value('DATABASE_URL'), urls.app);
    assert.equal(value('MIGRATION_DATABASE_URL'), urls.migrator);
    assert.equal(value('BOOTSTRAP_DATABASE_URL'), urls.admin);
    assert.equal(value('LOCAL_DATABASE_URL'), 'postgres://erp_app:l@localhost:5432/college_erp_dev');
    assert.equal(value('LOCAL_MIGRATION_DATABASE_URL'), 'postgres://erp_migrator:m@localhost:5432/college_erp_dev');
    assert.equal(value('JWT_SECRET'), 's');
    // Nothing to keep for a key that was absent.
    assert.equal(value('LOCAL_BOOTSTRAP_DATABASE_URL'), undefined);
    assert.ok(after.endsWith('\n'));
  });

  it('a second run never replaces the saved local values with Supabase ones', () => {
    const twice = rewriteEnv(rewriteEnv(local, urls), supabaseUrls(DIRECT, POOLER, 'other'));
    assert.match(twice, /^LOCAL_DATABASE_URL=postgres:\/\/erp_app:l@localhost:5432\/college_erp_dev$/m);
    assert.equal(twice.match(/^LOCAL_DATABASE_URL=/gm)?.length, 1);
    assert.doesNotMatch(twice, /^LOCAL_BOOTSTRAP_DATABASE_URL=/m);
  });
});

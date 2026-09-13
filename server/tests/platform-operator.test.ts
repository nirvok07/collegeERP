/**
 * OPS-1: an operator sets a platform account's password for development.
 *
 * What matters: the password policy still applies, the exact phrase is needed,
 * the act is audited as the system, and the second factor is untouched, so a
 * password alone still opens no platform session.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, resetData, seedPlatformAccount, setupDatabase, testConfig, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';
import { buildContainer } from '../src/container.ts';
import {
  operatorCreatePlatformOwner, operatorDisablePlatformAccount, operatorSetPlatformPassword,
  parseCreateOwnerArgs, parseDisableArgs, parseOperatorPasswordArgs,
} from '../src/modules/identity/application/platform-operator.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const login = (email: string, password: string) =>
  harness.app.inject({
    method: 'POST', url: '/v1/auth/platform/login', payload: { email, password },
  }) as Promise<LightMyRequestResponse>;

async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = createPool(MIGRATOR_URL);
  try {
    return (await pool.query(text, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

describe('operator password', () => {
  it('needs the exact phrase, and takes the password only from the environment', () => {
    assert.ok('error' in parseOperatorPasswordArgs([], 'secret-pass-1'));
    const args = [
      '--email', 'Owner@Nirvok.com', '--reason', 'dev login for testing', '--operator', 'Ops',
      '--confirm', 'SET PASSWORD owner@nirvok.com',
    ];
    assert.ok('error' in parseOperatorPasswordArgs(args, undefined));
    assert.ok('error' in parseOperatorPasswordArgs(args.slice(0, -1).concat('yes'), 'secret-pass-1'));
    assert.deepEqual(parseOperatorPasswordArgs(args, 'secret-pass-1'), {
      email: 'owner@nirvok.com', password: 'secret-pass-1', reason: 'dev login for testing', operator: 'Ops',
    });
  });

  it('sets a policy-valid password, audited as the system, and keeps the second factor', async () => {
    await seedPlatformAccount('owner@nirvok.com', 'platform-pass-123', 'owner');
    const container = buildContainer(testConfig());
    const set = (email: string, password: string) =>
      operatorSetPlatformPassword(container.platformMfa, { email, password, reason: 'Known dev login', operator: 'Ops' });
    try {
      assert.equal((await set('owner@nirvok.com', 'mnisbuakt')).ok, false, 'the policy still applies');
      assert.equal((await set('nobody@nirvok.com', 'mnisbuakt07')).ok, false);
      assert.equal((await set('owner@nirvok.com', 'mnisbuakt07')).ok, true);
    } finally {
      await container.close();
    }

    assert.notEqual((await login('owner@nirvok.com', 'platform-pass-123')).statusCode, 200, 'the old password stops working');
    const fresh = await login('owner@nirvok.com', 'mnisbuakt07');
    assert.equal(fresh.statusCode, 200);
    assert.equal(fresh.json().data.step, 'second_factor', 'a password alone still opens no session');

    const [row] = await sql(`SELECT * FROM audit_events WHERE action = 'platform_account.password_set_by_operator'`);
    assert.equal(row.actor_type, 'system');
    assert.match(row.reason, /operator: Ops/);
  });
});

describe('operator creates an Owner (OPS-2)', () => {
  it('needs the exact phrase, a name, and a password from the environment', () => {
    const args = [
      '--email', 'Real@Example.com', '--name', 'Surya Pandey', '--reason', 'real owner for development',
      '--operator', 'Ops', '--confirm', 'CREATE OWNER real@example.com',
    ];
    assert.ok('error' in parseCreateOwnerArgs(args, undefined));
    assert.ok('error' in parseCreateOwnerArgs(args.slice(0, -1).concat('yes'), 'pass-12345'));
    assert.deepEqual(parseCreateOwnerArgs(args, 'pass-12345'), {
      email: 'real@example.com', fullName: 'Surya Pandey', password: 'pass-12345',
      reason: 'real owner for development', operator: 'Ops',
    });
  });

  it('creates an active Owner who must set up an authenticator, audited as the system', async () => {
    await seedPlatformAccount('owner@nirvok.com', 'platform-pass-123', 'owner');
    const container = buildContainer(testConfig());
    const create = (email: string, password: string) => operatorCreatePlatformOwner(container.platformMfa, {
      email, fullName: 'Surya Pandey', password, reason: 'Real Owner account', operator: 'Ops',
    });
    try {
      assert.equal((await create('real@example.com', 'short')).ok, false, 'the policy still applies');
      assert.equal((await create('owner@nirvok.com', 'mnisbuakt07')).ok, false, 'an email is used once');
      assert.equal((await create('real@example.com', 'mnisbuakt07')).ok, true);
    } finally {
      await container.close();
    }

    const first = await login('real@example.com', 'mnisbuakt07');
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().data.step, 'enrolment', 'no session until an authenticator exists');

    const [role] = await sql(
      `SELECT r.role FROM platform_role_assignments r JOIN platform_accounts a ON a.id = r.platform_account_id
        WHERE a.email = 'real@example.com' AND r.ended_at IS NULL`,
    );
    assert.equal(role.role, 'owner');
    const events = await sql(`SELECT actor_type FROM audit_events WHERE action = 'platform_account.created_by_operator'`);
    assert.deepEqual(events.map((e) => e.actor_type), ['system']);
  });
});

describe('operator disables an account (OPS-2)', () => {
  it('needs the exact phrase', () => {
    const args = ['--email', 'Old@Example.com', '--reason', 'replaced by real owner', '--operator', 'Ops'];
    assert.ok('error' in parseDisableArgs(args.concat('--confirm', 'yes')));
    assert.deepEqual(parseDisableArgs(args.concat('--confirm', 'DISABLE old@example.com')), {
      email: 'old@example.com', reason: 'replaced by real owner', operator: 'Ops',
    });
  });

  it('never disables the last usable Owner, and a disabled account cannot sign in', async () => {
    await seedPlatformAccount('owner@nirvok.com', 'platform-pass-123', 'owner');
    const container = buildContainer(testConfig());
    const disable = (email: string) => operatorDisablePlatformAccount(container.platformMfa, {
      email, reason: 'Replaced by the real Owner', operator: 'Ops',
    });
    try {
      assert.equal((await disable('owner@nirvok.com')).ok, false, 'the platform keeps an Owner');
      await seedPlatformAccount('owner2@nirvok.com', 'platform-pass-123', 'owner');
      assert.equal((await disable('owner@nirvok.com')).ok, true);
      assert.equal((await disable('owner@nirvok.com')).ok, false, 'already disabled');
    } finally {
      await container.close();
    }
    assert.notEqual((await login('owner@nirvok.com', 'platform-pass-123')).statusCode, 200);
    const [row] = await sql(`SELECT actor_type, reason FROM audit_events WHERE action = 'platform_account.disabled'`);
    assert.equal(row.actor_type, 'system');
    assert.match(row.reason, /operator: Ops/);
  });
});

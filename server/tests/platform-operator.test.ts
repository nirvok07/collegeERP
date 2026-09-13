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
  operatorSetPlatformPassword, parseOperatorPasswordArgs,
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

/**
 * AD-63 sealing. Pure: no database, no server.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { AesGcmSealer, SealError, parseRetiredKeys, parseSealingKey } from '../src/infrastructure/crypto/secret-sealer.ts';
import { loadConfig, sealerFor, DEV_SEALING_KEY_ID } from '../src/config/config.ts';

const k = (id: string) => ({ id, key: randomBytes(32) });

describe('sealing a secret', () => {
  it('round-trips, and never contains the plaintext', () => {
    const sealer = new AesGcmSealer(k('k1'));
    const sealed = sealer.seal('JBSWY3DPEHPK3PXP', 'platform_totp:a1');
    assert.ok(sealed.startsWith('s1.k1.'));
    assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'));
    assert.equal(sealer.open(sealed, 'platform_totp:a1'), 'JBSWY3DPEHPK3PXP');
  });

  it('never seals the same value to the same text', () => {
    const sealer = new AesGcmSealer(k('k1'));
    assert.notEqual(sealer.seal('x', 'c'), sealer.seal('x', 'c'));
  });

  it('fails closed on a wrong key, an unknown key id, tampering, a moved value and malformed input', () => {
    const a = new AesGcmSealer(k('k1'));
    const sealed = a.seal('secret-value', 'platform_totp:a1');
    const wrongKey = new AesGcmSealer(k('k1'));
    assert.throws(() => wrongKey.open(sealed, 'platform_totp:a1'), SealError);
    assert.throws(() => new AesGcmSealer(k('k2')).open(sealed, 'platform_totp:a1'), SealError, 'unknown key id');
    assert.throws(() => a.open(sealed, 'platform_totp:someone-else'), SealError, 'bound to its context');

    const parts = sealed.split('.');
    const tag = Buffer.from(parts[3]!, 'base64url'); tag[0]! ^= 1;
    assert.throws(() => a.open([parts[0], parts[1], parts[2], tag.toString('base64url'), parts[4]].join('.'), 'platform_totp:a1'), SealError);
    const ct = Buffer.from(parts[4]!, 'base64url'); ct[0]! ^= 1;
    assert.throws(() => a.open([...parts.slice(0, 4), ct.toString('base64url')].join('.'), 'platform_totp:a1'), SealError);
    for (const bad of ['', 'x', 's2.k1.a.b.c', 's1.k1.AAAA.BBBB.CCCC', sealed + '.extra']) {
      assert.throws(() => a.open(bad, 'platform_totp:a1'), SealError, bad);
    }
  });

  it('opens values sealed under a retired key, and seals new ones under the current key', () => {
    const old = k('k1');
    const sealed = new AesGcmSealer(old).seal('v', 'c');
    const rotated = new AesGcmSealer(k('k2'), [old]);
    assert.equal(rotated.open(sealed, 'c'), 'v');
    assert.ok(rotated.seal('v', 'c').startsWith('s1.k2.'));
  });

  it('never puts key material or plaintext in its error', () => {
    const key = k('k1');
    const sealed = new AesGcmSealer(key).seal('plaintext-marker', 'c');
    try {
      new AesGcmSealer(k('k1')).open(sealed, 'c');
      assert.fail('should not open');
    } catch (e) {
      const text = `${(e as Error).message} ${(e as Error).stack}`;
      assert.ok(!text.includes('plaintext-marker'));
      assert.ok(!text.includes(key.key.toString('base64')));
    }
  });
});

describe('sealing keys in configuration', () => {
  const base = { DATABASE_URL: 'x', MIGRATION_DATABASE_URL: 'y', JWT_SECRET: 'j'.repeat(40), COOKIE_SECRET: 'c'.repeat(40) };

  it('refuses to start in production without a key, or with an invalid one', () => {
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' } as never), /SECRET_SEALING_KEY must be supplied/);
    assert.throws(
      () => loadConfig({ ...base, NODE_ENV: 'production', SECRET_SEALING_KEY: Buffer.alloc(16).toString('base64') } as never),
      /must be 32 bytes/,
    );
  });

  it('never echoes a key back in a validation error', () => {
    const bad = Buffer.alloc(20, 7).toString('base64');
    try {
      loadConfig({ ...base, NODE_ENV: 'production', SECRET_SEALING_KEY: bad } as never);
      assert.fail('should refuse');
    } catch (e) {
      assert.ok(!(e as Error).message.includes(bad));
    }
  });

  it('outside production, uses an announced development key that production can never open', () => {
    const warnings: string[] = [];
    const dev = sealerFor(loadConfig({ ...base, NODE_ENV: 'development' } as never), (m) => warnings.push(m));
    assert.match(warnings[0]!, /insecure development key/);
    const sealed = dev.seal('v', 'c');
    assert.ok(sealed.startsWith(`s1.${DEV_SEALING_KEY_ID}.`));
    const prod = sealerFor(loadConfig({ ...base, NODE_ENV: 'production', SECRET_SEALING_KEY: randomBytes(32).toString('base64') } as never));
    assert.throws(() => prod.open(sealed, 'c'), SealError);
  });

  it('validates key ids and retired keys', () => {
    assert.throws(() => parseSealingKey('Bad Id', randomBytes(32).toString('base64'), 'X'), /key id/);
    assert.equal(parseRetiredKeys(`old:${randomBytes(32).toString('base64')}`).length, 1);
    assert.throws(() => parseRetiredKeys('old:short'), /32 bytes/);
  });
});

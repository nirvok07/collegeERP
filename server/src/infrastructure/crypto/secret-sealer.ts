/**
 * AD-63: sealing secrets the server must read back, with AES-256-GCM from
 * Node's own crypto. Standard authenticated encryption; nothing custom.
 *
 * Format, one ASCII string, base64url fields:
 *
 *     s1.<keyId>.<iv 12 bytes>.<tag 16 bytes>.<ciphertext>
 *
 * `s1` is the format and algorithm version. The authenticated data is
 * `s1.<keyId>.<context>`, where context names what the secret is and whose
 * it is (for example `platform_totp:<accountId>`), so a sealed value copied to
 * another row or purpose does not open. Every failure is the same SealError,
 * which never carries key material, plaintext or ciphertext.
 *
 * Rotation: values seal under the current key; opening accepts the current key
 * and any retired key still configured.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SecretSealer {
  seal(plaintext: string, context: string): string;
  open(sealed: string, context: string): string;
}

export class SealError extends Error {
  constructor() {
    super('A sealed secret could not be opened.');
    this.name = 'SealError';
  }
}

export interface SealingKey {
  id: string;
  key: Buffer;
}

const VERSION = 's1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[a-z0-9-]{1,32}$/;

export class AesGcmSealer implements SecretSealer {
  private readonly keys: Map<string, Buffer>;

  constructor(private readonly current: SealingKey, retired: SealingKey[] = []) {
    this.keys = new Map([[current.id, current.key], ...retired.map((k) => [k.id, k.key] as const)]);
  }

  seal(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.current.key, iv);
    cipher.setAAD(Buffer.from(`${VERSION}.${this.current.id}.${context}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, this.current.id, iv, cipher.getAuthTag(), ciphertext]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  open(sealed: string, context: string): string {
    const parts = sealed.split('.');
    if (parts.length !== 5) throw new SealError();
    const [version, keyId, ivText, tagText, ctText] = parts as [string, string, string, string, string];
    const key = this.keys.get(keyId);
    if (version !== VERSION || !key) throw new SealError();
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SealError();
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(`${version}.${keyId}.${context}`, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(ctText, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new SealError();
    }
  }
}

/** Parses and validates a key. Errors name the setting, never its value. */
export function parseSealingKey(id: string, base64: string, setting: string): SealingKey {
  if (!KEY_ID.test(id)) throw new Error(`${setting}: key id must be 1 to 32 lowercase letters, digits or hyphens`);
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error(`${setting}: must be 32 bytes, base64-encoded`);
  return { id, key };
}

/** `id:base64,id:base64`, for keys that may still open old values. */
export function parseRetiredKeys(value: string | undefined): SealingKey[] {
  if (!value) return [];
  return value.split(',').map((entry) => {
    const [id, key] = entry.split(':');
    return parseSealingKey((id ?? '').trim(), (key ?? '').trim(), 'SECRET_SEALING_RETIRED_KEYS');
  });
}

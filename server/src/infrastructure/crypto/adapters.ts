import { randomUUID, randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import type {
  AccessTokenClaims,
  Clock,
  IdGenerator,
  PasswordHasher,
  TokenIssuer,
} from '../../shared/application/ports.ts';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/**
 * scrypt from Node's standard library: memory-hard, no native build step, and no
 * dependency to audit. Format is versioned so the parameters can be raised later
 * without invalidating existing credentials.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  private readonly keyLength = 64;

  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(plaintext.normalize('NFKC'), salt, this.keyLength);
    return `scrypt$1$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  async verify(plaintext: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[2] ?? '', 'hex');
    const expected = Buffer.from(parts[3] ?? '', 'hex');
    if (salt.length === 0 || expected.length === 0) return false;
    const derived = await scrypt(plaintext.normalize('NFKC'), salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}

export class JwtTokenIssuer implements TokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly accessTtlSeconds: number,
  ) {}

  issueAccessToken(claims: AccessTokenClaims): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + this.accessTtlSeconds * 1000);
    const token = jwt.sign(
      {
        sub: claims.sub,
        act: claims.actorType,
        tid: claims.tenantId,
        aid: claims.accountId,
      },
      this.secret,
      { expiresIn: this.accessTtlSeconds, algorithm: 'HS256' },
    );
    return { token, expiresAt };
  }

  verifyAccessToken(token: string): AccessTokenClaims | null {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      if (!payload.sub || (payload.act !== 'platform' && payload.act !== 'person')) return null;
      return {
        sub: payload.sub,
        actorType: payload.act,
        tenantId: (payload.tid as string | null) ?? null,
        accountId: (payload.aid as string | null) ?? null,
      };
    } catch {
      // AD-16 note: permissions are never carried in the token, so a valid token
      // proves identity only. Authority is resolved per request.
      return null;
    }
  }

  issueOpaqueToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashOpaqueToken(token) };
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

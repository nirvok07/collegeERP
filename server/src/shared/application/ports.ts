import type { Tx } from './unit-of-work.ts';
/**
 * Ports the application layer requires. Every one is implemented in
 * src/infrastructure by an adapter. Nothing in domain/ or application/ imports
 * pg, fastify, cloudinary or any other vendor package: dependencies point inward.
 */

/** Injected rather than read from Date.now(), so time-dependent rules are testable. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, stored: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  sub: string;
  actorType: 'platform' | 'person';
  tenantId: string | null;
  accountId: string | null;
}

export interface TokenIssuer {
  issueAccessToken(claims: AccessTokenClaims): { token: string; expiresAt: Date };
  verifyAccessToken(token: string): AccessTokenClaims | null;
  /** Opaque, high-entropy. Stored hashed; the plaintext is returned once. */
  issueOpaqueToken(): { token: string; hash: string };
  hashOpaqueToken(token: string): string;
}

export interface AuditEvent {
  correlationId: string;
  tenantId: string | null;
  actorType: 'platform' | 'person' | 'system';
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  scopeType?: string | null;
  scopeRefId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipHash?: string | null;
}

/**
 * P6. Audit is append-only: there is deliberately no update or delete method,
 * so no application code can rewrite history.
 *
 * Passing a transaction makes the audit row commit with the work it describes,
 * which is what makes "the action happened but was not audited" impossible.
 */
export interface AuditWriter {
  record(event: AuditEvent, tx?: Tx): Promise<void>;
}

/** Cloudinary sits behind this. The application never sees a Cloudinary type. */
export interface MediaStorage {
  upload(input: {
    bytes: Buffer;
    contentType: string;
    folder: string;
    fileName: string;
  }): Promise<StoredMedia>;
  urlFor(reference: string, options?: { width?: number; height?: number }): string;
  delete(reference: string): Promise<void>;
}

export interface StoredMedia {
  /** Vendor-neutral handle persisted in PostgreSQL. Binaries are never stored in the database. */
  reference: string;
  contentType: string;
  byteSize: number;
  width?: number;
  height?: number;
}

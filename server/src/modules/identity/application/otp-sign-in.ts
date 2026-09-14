/**
 * OTP-1 (AD-82): sign-in by a one-time code sent to the person's email or
 * mobile. One flow for a college's people and for the platform's.
 *
 * BR-24 holds: asking for a code answers the same way whether or not anyone
 * has that identifier. An unknown identifier gets a decoy challenge with no
 * code, which verifying always refuses and which counts toward the same limit.
 * A person who cannot sign in (suspended, locked, ambiguous) is answered the
 * same way, so the endpoint cannot be used to learn who is registered.
 *
 * Until go-live no message is sent and every code is `fixedCode` (AD-82 §5).
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail, type Failure } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  AccountRecord, AccountRepository, LoginAttemptRepository, PlatformAccountRepository, RefreshTokenRepository,
} from './ports.ts';
import { issueTokens, type AuthTokens, type SignedInActor } from './authenticate.ts';

export type OtpChannel = 'email' | 'whatsapp' | 'sms';
export type IdentifierKind = 'email' | 'phone' | 'enrolment';

/**
 * Where a code goes. The real senders (email; WhatsApp falling back to SMS)
 * are AD-82's go-live blocker; the fallback is the sender's own concern.
 */
export interface OtpSender {
  /** False when nothing can be sent: every request is then refused alike. */
  readonly ready: boolean;
  send(input: { channel: OtpChannel; destination: string; code: string }): Promise<void>;
}

/** A live college account a typed identifier names, with where a code can go. */
export interface SignInCandidate extends AccountRecord {
  email: string | null;
  phone: string | null;
}

export interface SignInIdentityReader {
  /** In the college in context. At most two, so an ambiguous identifier shows. */
  candidates(tx: Tx, match: { kind: IdentifierKind; value: string }): Promise<SignInCandidate[]>;
}

export interface OtpChallengeRecord {
  id: string;
  tenantId: string | null;
  accountId: string | null;
  platformAccountId: string | null;
  identifierHash: string;
  channel: OtpChannel;
  codeHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
}

export interface OtpRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string | null; accountId: string | null; platformAccountId: string | null;
    identifierHash: string; channel: OtpChannel; tokenHash: string; codeHash: string | null; expiresAt: Date;
  }): Promise<void>;
  countSince(tx: Tx, identifierHash: string, since: Date): Promise<number>;
  findByTokenHash(tx: Tx, tokenHash: string): Promise<OtpChallengeRecord | null>;
  /** One more wrong try; the new count. */
  fail(tx: Tx, id: string): Promise<number>;
  /** False when someone else used it first. */
  consume(tx: Tx, id: string, at: Date): Promise<boolean>;
  /** Spends every live code of an account, so codes cannot be stockpiled. */
  revokeLive(tx: Tx, owner: { accountId: string | null; platformAccountId: string | null }, at: Date): Promise<void>;
}

export interface OtpDeps {
  uow: UnitOfWork;
  otp: OtpRepository;
  identities: SignInIdentityReader;
  accounts: AccountRepository;
  platformAccounts: PlatformAccountRepository;
  refreshTokens: RefreshTokenRepository;
  loginAttempts: LoginAttemptRepository;
  audit: AuditWriter;
  tokens: TokenIssuer;
  ids: IdGenerator;
  clock: Clock;
  refreshTtlDays: number;
  /** AD-60: a suspended or closed college signs nobody in. */
  tenantAccess: { denialFor(tenantId: string): Promise<Failure | null> };
  sender: OtpSender;
  /** AD-82: until go-live every code is this. Empty: real, random codes. */
  fixedCode: string;
}

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS = 5;
export const OTP_REQUEST_WINDOW_SECONDS = 15 * 60;

/** How the app tells the person where to look, without saying whether they exist. */
export type CodeDestination = 'email' | 'mobile' | 'record';

export interface CodeRequested {
  challengeToken: string;
  expiresAt: Date;
  destination: CodeDestination;
}

const EXPIRED = 'This code has expired. Ask for a new one.';
const WRONG = 'That code is not correct.';
const TOO_MANY = 'Too many codes asked for. Wait a few minutes and try again.';
const CANNOT_SEND = 'Codes cannot be sent right now. Try again shortly.';

/**
 * What was typed: an email, a mobile number, or a student's enrolment number.
 * A mobile number is at least ten digits with nothing but +, spaces and dashes
 * around them, compared on its last ten digits (the Indian number without +91).
 */
export function classifyIdentifier(raw: string): { kind: IdentifierKind; value: string } {
  const v = raw.trim();
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() };
  const digits = v.replace(/\D/g, '');
  if (digits.length >= 10 && /^[+\d\s-]+$/.test(v)) return { kind: 'phone', value: digits.slice(-10) };
  return { kind: 'enrolment', value: v.toLowerCase() };
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const codeHashFor = (challengeId: string, code: string) => sha256(`${challengeId}:${code}`);
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const destinationOf = (kind: IdentifierKind): CodeDestination =>
  kind === 'email' ? 'email' : kind === 'phone' ? 'mobile' : 'record';

const newCode = (deps: OtpDeps) => deps.fixedCode || String(randomInt(0, 1_000_000)).padStart(6, '0');

const canSignIn = (a: { status: string; lockedUntil: Date | null }, at: Date) =>
  (a.status === 'active' || a.status === 'invited') && !(a.lockedUntil && a.lockedUntil.getTime() > at.getTime());

/** Where this person's code goes for what they typed; null when nowhere. */
function deliveryFor(kind: IdentifierKind, value: string, person: SignInCandidate) {
  if (kind === 'email') return { channel: 'email' as const, destination: value };
  if (kind === 'phone') return { channel: 'whatsapp' as const, destination: value };
  const phone = person.phone?.replace(/\D/g, '').slice(-10);
  if (phone && phone.length === 10) return { channel: 'whatsapp' as const, destination: phone };
  if (person.email) return { channel: 'email' as const, destination: person.email };
  return null;
}

async function issueChallenge(
  deps: OtpDeps,
  tx: Tx,
  input: {
    tenantId: string | null;
    owner: { accountId: string | null; platformAccountId: string | null } | null;
    identifierHash: string;
    channel: OtpChannel;
  },
  at: Date,
): Promise<{ token: string; expiresAt: Date; code: string | null }> {
  const id = deps.ids.next();
  const { token, hash: tokenHash } = deps.tokens.issueOpaqueToken();
  const expiresAt = new Date(at.getTime() + OTP_TTL_SECONDS * 1000);
  const code = input.owner ? newCode(deps) : null;
  if (input.owner) await deps.otp.revokeLive(tx, input.owner, at);
  await deps.otp.create(tx, {
    id,
    tenantId: input.tenantId,
    accountId: input.owner?.accountId ?? null,
    platformAccountId: input.owner?.platformAccountId ?? null,
    identifierHash: input.identifierHash,
    channel: input.channel,
    tokenHash,
    codeHash: code ? codeHashFor(id, code) : null,
    expiresAt,
  });
  return { token, expiresAt, code };
}

/**
 * Sends after the challenge is committed. A failed send is not reported: that
 * would say the identifier exists. The person asks again.
 */
async function deliver(deps: OtpDeps, send: { channel: OtpChannel; destination: string }, code: string) {
  try {
    await deps.sender.send({ ...send, code });
  } catch {
    // The sender logs its own failures; nothing here may reveal existence.
  }
}

/** Spent, expired, over its tries, or wrong: the challenge, else why not. */
async function checkCode(deps: OtpDeps, tx: Tx, challengeToken: string, code: string, at: Date): Promise<Result<OtpChallengeRecord>> {
  const challenge = await deps.otp.findByTokenHash(tx, deps.tokens.hashOpaqueToken(challengeToken));
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= at.getTime()
      || challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return Err(fail('UNAUTHENTICATED', EXPIRED));
  }
  const presented = code.replace(/\s/g, '');
  const right = challenge.codeHash !== null && /^\d{6}$/.test(presented)
    && sameHash(challenge.codeHash, codeHashFor(challenge.id, presented));
  if (!right) {
    const attempts = await deps.otp.fail(tx, challenge.id);
    return Err(fail('UNAUTHENTICATED', attempts >= OTP_MAX_ATTEMPTS ? EXPIRED : WRONG));
  }
  if (!(await deps.otp.consume(tx, challenge.id, at))) return Err(fail('UNAUTHENTICATED', EXPIRED));
  return Ok(challenge);
}

/* ---------------------------------------------------------------- college -- */

export async function requestCollegeCode(
  deps: OtpDeps,
  input: { tenantId: string; identifier: string },
): Promise<Result<CodeRequested>> {
  if (!deps.fixedCode && !deps.sender.ready) return Err(fail('UNKNOWN', CANNOT_SEND));
  const at = deps.clock.now();
  const typed = classifyIdentifier(input.identifier);
  const identifierHash = sha256(`${typed.kind}:${typed.value}`);

  const outcome = await deps.uow.run(input.tenantId, async (tx) => {
    const since = new Date(at.getTime() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    if (await deps.otp.countSince(tx, identifierHash, since) >= OTP_MAX_REQUESTS) return null;

    // Exactly one person, able to sign in, with somewhere to send the code.
    // Anything else is answered exactly like an identifier nobody has.
    const found = await deps.identities.candidates(tx, typed);
    const person = found.length === 1 && found[0] && canSignIn(found[0], at) ? found[0] : null;
    const send = person ? deliveryFor(typed.kind, typed.value, person) : null;
    const issued = await issueChallenge(deps, tx, {
      tenantId: input.tenantId,
      owner: person && send ? { accountId: person.id, platformAccountId: null } : null,
      identifierHash,
      channel: send?.channel ?? (typed.kind === 'email' ? 'email' : 'whatsapp'),
    }, at);
    return { issued, send };
  });

  if (!outcome) return Err(fail('RATE_LIMITED', TOO_MANY));
  if (outcome.send && outcome.issued.code) await deliver(deps, outcome.send, outcome.issued.code);
  return Ok({
    challengeToken: outcome.issued.token,
    expiresAt: outcome.issued.expiresAt,
    destination: destinationOf(typed.kind),
  });
}

export async function verifyCollegeCode(
  deps: OtpDeps,
  input: { tenantId: string; challengeToken: string; code: string; ipHash?: string | null },
): Promise<Result<{ actor: SignedInActor; tokens: AuthTokens }>> {
  const denial = await deps.tenantAccess.denialFor(input.tenantId);
  if (denial) return Err(denial);
  const at = deps.clock.now();

  return deps.uow.run(input.tenantId, async (tx) => {
    const checked = await checkCode(deps, tx, input.challengeToken, input.code, at);
    if (!checked.ok) return checked;
    const challenge = checked.value;

    const account = challenge.accountId ? await deps.accounts.findById(tx, challenge.accountId) : null;
    if (!account || !canSignIn(account, at)) return Err(fail('UNAUTHENTICATED', EXPIRED));

    // AD-82 §4: being on record is the invitation; the first code activates.
    const activated = account.status === 'invited';
    if (activated) await deps.accounts.markActivated(tx, account.id, at);
    await deps.accounts.updateSecurityState(tx, account.id, { failedAttempts: 0, lockedUntil: null, status: 'active' });
    await deps.accounts.recordSignIn(tx, account.id, at);
    await deps.loginAttempts.record(tx, {
      id: deps.ids.next(), tenantId: input.tenantId, identifierHash: challenge.identifierHash,
      accountId: account.id, outcome: 'success', failureReason: null, ipHash: input.ipHash ?? null,
    });

    const tokens = await issueTokens(deps, tx, {
      sub: account.personId, actorType: 'person', tenantId: input.tenantId, accountId: account.id,
    }, { platformAccountId: null, accountId: account.id, tenantId: input.tenantId }, at);

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: input.tenantId, actorType: 'person',
      actorId: account.personId, action: 'auth.signed_in', subjectType: 'user_account',
      subjectId: account.id, ipHash: input.ipHash ?? null,
      after: { method: 'code', channel: challenge.channel, activated },
    }, tx);

    return Ok({
      actor: {
        actorType: 'person' as const, actorId: account.personId, tenantId: input.tenantId,
        accountId: account.id, fullName: account.loginIdentifier,
      },
      tokens,
    });
  });
}

/* --------------------------------------------------------------- platform -- */

export async function requestPlatformCode(
  deps: OtpDeps,
  input: { email: string },
): Promise<Result<CodeRequested>> {
  if (!deps.fixedCode && !deps.sender.ready) return Err(fail('UNKNOWN', CANNOT_SEND));
  const at = deps.clock.now();
  const email = input.email.trim().toLowerCase();
  const identifierHash = sha256(`platform:${email}`);

  const outcome = await deps.uow.run(null, async (tx) => {
    const since = new Date(at.getTime() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    if (await deps.otp.countSince(tx, identifierHash, since) >= OTP_MAX_REQUESTS) return null;
    const account = await deps.platformAccounts.findByEmail(tx, email);
    const able = account && canSignIn(account, at) ? account : null;
    const issued = await issueChallenge(deps, tx, {
      tenantId: null,
      owner: able ? { accountId: null, platformAccountId: able.id } : null,
      identifierHash,
      channel: 'email',
    }, at);
    return { issued, send: able ? { channel: 'email' as const, destination: email } : null };
  });

  if (!outcome) return Err(fail('RATE_LIMITED', TOO_MANY));
  if (outcome.send && outcome.issued.code) await deliver(deps, outcome.send, outcome.issued.code);
  return Ok({ challengeToken: outcome.issued.token, expiresAt: outcome.issued.expiresAt, destination: 'email' });
}

export async function verifyPlatformCode(
  deps: OtpDeps,
  input: { challengeToken: string; code: string; ipHash?: string | null },
): Promise<Result<{ actor: SignedInActor; tokens: AuthTokens }>> {
  const at = deps.clock.now();
  return deps.uow.run(null, async (tx) => {
    const checked = await checkCode(deps, tx, input.challengeToken, input.code, at);
    if (!checked.ok) return checked;
    const challenge = checked.value;

    const account = challenge.platformAccountId
      ? await deps.platformAccounts.findById(tx, challenge.platformAccountId)
      : null;
    if (!account || !canSignIn(account, at)) return Err(fail('UNAUTHENTICATED', EXPIRED));

    await deps.platformAccounts.updateSecurityState(tx, account.id, { failedAttempts: 0, lockedUntil: null, status: 'active' });
    await deps.platformAccounts.recordSignIn(tx, account.id, at);
    await deps.loginAttempts.record(tx, {
      id: deps.ids.next(), tenantId: null, identifierHash: challenge.identifierHash,
      accountId: account.id, outcome: 'success', failureReason: null, ipHash: input.ipHash ?? null,
    });

    const tokens = await issueTokens(deps, tx, {
      sub: account.id, actorType: 'platform', tenantId: null, accountId: null,
    }, { platformAccountId: account.id, accountId: null, tenantId: null }, at);

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'platform', actorId: account.id,
      action: 'auth.signed_in', subjectType: 'platform_account', subjectId: account.id,
      ipHash: input.ipHash ?? null, after: { method: 'code', channel: 'email' },
    }, tx);

    return Ok({
      actor: { actorType: 'platform' as const, actorId: account.id, tenantId: null, accountId: null, fullName: account.fullName },
      tokens,
    });
  });
}

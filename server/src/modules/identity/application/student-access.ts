/**
 * ST-1 (AD-69): a student's own way into the app, issued by the college.
 *
 * An administrator issues access from the student's record. The first time, a
 * college account is created for the student (it takes a seat, AD-65, which
 * the database enforces) with the enrolment number as its sign-in name. Each
 * issue returns a one-time activation code, shown once and printable, stored
 * only as a hash; issuing again revokes the earlier code. The student redeems
 * it with the college code, their enrolment number and the code, and sets a
 * password. The same code redeems a forgotten password later, as AD-80 does
 * for staff: the old password works until the code is used, and using it ends
 * every session.
 */
import { randomInt } from 'node:crypto';
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { AccountRepository, InvitationRepository } from './ports.ts';

/** A printed code has to survive a week in a bag before the student uses it. */
export const ACTIVATION_TTL_HOURS = 24 * 7;
export const STUDENT_RESET_TTL_HOURS = 24;

/** No 0/O or 1/I, so a code read off paper is typed right the first time. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

/** Twelve characters from 32 (60 bits), shown as XXXX-XXXX-XXXX. */
export function newActivationCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** What is hashed and compared: capitals, no separators, whatever was typed. */
export function normaliseActivationCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** A student's sign-in name: the enrolment number, in the lower case sign-in uses. */
export const studentLoginIdentifier = (enrolmentNumber: string) => enrolmentNumber.trim().toLowerCase();

/** What this capability needs of a student record; M5 owns the record itself. */
export interface StudentLookup {
  findById(tx: Tx, id: string): Promise<{
    id: string; personId: string; fullName: string; enrolmentNumber: string; status: string;
  } | null>;
}

export interface StudentAccessDeps {
  uow: UnitOfWork;
  students: StudentLookup;
  accounts: AccountRepository;
  invitations: InvitationRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  tokens: TokenIssuer;
}

export interface IssuedStudentAccess {
  kind: 'activation' | 'reset';
  code: string;
  expiresAt: Date;
  loginIdentifier: string;
}

const REUSABLE = new Set(['invited', 'active', 'locked']);

export async function issueStudentAccess(
  deps: StudentAccessDeps,
  actor: { tenantId: string; personId: string },
  input: { studentId: string },
): Promise<Result<IssuedStudentAccess>> {
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const student = await deps.students.findById(tx, input.studentId);
      if (!student) return Err(fail('NOT_FOUND', 'That student was not found.'));
      if (student.status === 'withdrawn' || student.status === 'graduated') {
        return Err(fail('CONFLICT', `${student.fullName} is ${student.status}, so they cannot be given app access.`));
      }

      const now = deps.clock.now();
      const loginIdentifier = studentLoginIdentifier(student.enrolmentNumber);
      let account = await deps.accounts.findByPersonId(tx, student.personId);
      if (!account) {
        // The seat trigger (AD-65) refuses this when the college is full.
        account = await deps.accounts.create(tx, {
          id: deps.ids.next(),
          tenantId: actor.tenantId,
          personId: student.personId,
          loginIdentifier,
          status: 'invited',
          mfaRequired: false,
        });
      } else if (!REUSABLE.has(account.status)) {
        return Err(fail('CONFLICT', `${student.fullName}'s account is ${account.status}, so it cannot be given a code.`));
      }

      const kind = account.status === 'invited' ? 'activation' : 'reset';
      const ttlHours = kind === 'activation' ? ACTIVATION_TTL_HOURS : STUDENT_RESET_TTL_HOURS;
      const revoked = await deps.invitations.revokeOutstanding(tx, account.id, now);
      const code = newActivationCode();
      const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
      const invitationId = deps.ids.next();
      await deps.invitations.issue(tx, {
        id: invitationId,
        tenantId: actor.tenantId,
        accountId: account.id,
        tokenHash: deps.tokens.hashOpaqueToken(normaliseActivationCode(code)),
        expiresAt,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: actor.tenantId,
        actorType: 'person',
        actorId: actor.personId,
        action: kind === 'activation' ? 'student.access_issued' : 'account.password_reset_issued',
        subjectType: 'user_account',
        subjectId: account.id,
        // Never the code or its hash.
        after: { student_id: student.id, invitation_id: invitationId, expires_at: expiresAt.toISOString(), revoked_previous: revoked },
      }, tx);

      return Ok({ kind, code, expiresAt, loginIdentifier: account.loginIdentifier });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

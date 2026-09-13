/**
 * OPS-1: an operator sets a platform account's password from the command line.
 *
 * Development and app testing only; the command refuses in production. It
 * exists so a known Owner can sign in to a development database without the
 * email an invitation needs. In production a lost password is an Owner
 * reissuing the invitation in the console (SA-3a). The authenticator is never
 * touched: the account still needs its second factor, or enrols one at its
 * next sign-in, so a password alone still opens nothing (AD-62).
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import { validatePassword } from '../domain/account-policy.ts';
import type { PlatformMfaDeps } from './platform-mfa.ts';

export interface OperatorPasswordInput {
  email: string;
  password: string;
  reason: string;
  operator: string;
}

export async function operatorSetPlatformPassword(
  deps: PlatformMfaDeps,
  input: OperatorPasswordInput,
): Promise<Result<{ accountId: string }>> {
  const reason = input.reason.trim();
  if (reason.length < 10) return Err(fail('VALIDATION_FAILED', 'Give a reason of at least ten characters.'));
  const problem = validatePassword(input.password);
  if (problem) return Err(fail('VALIDATION_FAILED', problem));
  const hash = await deps.hasher.hash(input.password);

  return deps.uow.run(null, async (tx) => {
    const account = await deps.mfa.stateByEmail(tx, input.email.trim().toLowerCase());
    if (!account) return Err(fail('NOT_FOUND', 'No platform account has that email.'));
    if (account.status !== 'active') {
      return Err(fail('CONFLICT', 'Only an active platform account can be given a password here.'));
    }
    await deps.mfa.setCredential(tx, account.id, hash);
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'system', actorId: null,
      action: 'platform_account.password_set_by_operator', subjectType: 'platform_account', subjectId: account.id,
      reason: `${reason} (operator: ${input.operator})`,
    }, tx);
    return Ok({ accountId: account.id });
  });
}

/**
 * The command line's guard against accidents. The password comes from the
 * environment, never an argument, so it stays out of the process list.
 */
export function parseOperatorPasswordArgs(
  argv: string[],
  password: string | undefined,
): OperatorPasswordInput | { error: string } {
  const value = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1]?.trim() ?? '' : '';
  };
  const email = value('email').toLowerCase();
  const reason = value('reason');
  const operator = value('operator');
  if (!email || !reason || !operator) {
    return {
      error: 'Usage: PLATFORM_PASSWORD=<password> npm run platform:set-password -- --email <email> ' +
        '--reason "<why>" --operator "<your name>" --confirm "SET PASSWORD <email>"',
    };
  }
  if (value('confirm') !== `SET PASSWORD ${email}`) {
    return { error: `Refusing: --confirm must be exactly "SET PASSWORD ${email}".` };
  }
  if (!password) return { error: 'Set PLATFORM_PASSWORD in the environment; it is never taken as an argument.' };
  return { email, password, reason, operator };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const argValue = (argv: string[], name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1]?.trim() ?? '' : '';
};

export interface OperatorCreateOwnerInput {
  email: string;
  fullName: string;
  password: string;
  reason: string;
  operator: string;
}

/**
 * OPS-2: an operator creates an active Owner, for development only (AD-74).
 * It exists because a fresh database, or one whose Owners have no
 * authenticator yet, has nobody who can create an account in the console.
 * The account has a policy-checked password and no authenticator, so its
 * first sign-in sets one up: a password alone still opens nothing (AD-62).
 */
export async function operatorCreatePlatformOwner(
  deps: PlatformMfaDeps,
  input: OperatorCreateOwnerInput,
): Promise<Result<{ accountId: string }>> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const reason = input.reason.trim();
  if (!EMAIL.test(email)) return Err(fail('VALIDATION_FAILED', 'Enter a valid email address.'));
  if (fullName.length < 2) return Err(fail('VALIDATION_FAILED', 'Enter the person’s name.'));
  if (reason.length < 10) return Err(fail('VALIDATION_FAILED', 'Give a reason of at least ten characters.'));
  const problem = validatePassword(input.password);
  if (problem) return Err(fail('VALIDATION_FAILED', problem));
  const hash = await deps.hasher.hash(input.password);
  const note = `${reason} (operator: ${input.operator})`;

  return deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    if (await deps.platformAdmin.emailTaken(tx, email)) {
      return Err(fail('CONFLICT', 'A platform account with that email already exists.'));
    }
    const id = deps.ids.next();
    await deps.platformAdmin.create(tx, { id, email, fullName });
    await deps.mfa.setCredential(tx, id, hash);
    await deps.platformAdmin.setStatus(tx, id, 'active');
    // Operator bootstrap, as migration 021 documents: no granting account.
    await deps.platformAdmin.grant(tx, {
      id: deps.ids.next(), accountId: id, role: 'owner', grantedBy: null, reason: 'Created by operator',
    });
    const correlationId = deps.ids.next();
    await deps.audit.record({
      correlationId, tenantId: null, actorType: 'system', actorId: null,
      action: 'platform_account.created_by_operator', subjectType: 'platform_account', subjectId: id,
      after: { email, full_name: fullName, status: 'active' }, reason: note,
    }, tx);
    await deps.audit.record({
      correlationId, tenantId: null, actorType: 'system', actorId: null,
      action: 'platform_role.assigned', subjectType: 'platform_account', subjectId: id,
      after: { role: 'owner' }, reason: note,
    }, tx);
    return Ok({ accountId: id });
  });
}

/**
 * OPS-2: an operator disables a platform account, for development only
 * (AD-74). The same rule as the console: the platform always keeps an
 * active Owner.
 */
export async function operatorDisablePlatformAccount(
  deps: PlatformMfaDeps,
  input: { email: string; reason: string; operator: string },
): Promise<Result<{ accountId: string }>> {
  const reason = input.reason.trim();
  if (reason.length < 10) return Err(fail('VALIDATION_FAILED', 'Give a reason of at least ten characters.'));

  return deps.uow.run(null, async (tx) => {
    await deps.platformAdmin.lockOwnership(tx);
    const account = await deps.mfa.stateByEmail(tx, input.email.trim().toLowerCase());
    if (!account) return Err(fail('NOT_FOUND', 'No platform account has that email.'));
    if (account.status !== 'active') return Err(fail('CONFLICT', 'This account is not active.'));
    const role = await deps.platformAdmin.activeAssignment(tx, account.id);
    if (role?.role === 'owner' && (await deps.platformAdmin.countUsableOwners(tx)) <= 1) {
      return Err(fail('CONFLICT', 'This is the last active Owner. The platform always keeps one.'));
    }
    await deps.platformAdmin.setStatus(tx, account.id, 'suspended');
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: null, actorType: 'system', actorId: null,
      action: 'platform_account.disabled', subjectType: 'platform_account', subjectId: account.id,
      before: { status: 'active' }, after: { status: 'suspended' },
      reason: `${reason} (operator: ${input.operator})`,
    }, tx);
    return Ok({ accountId: account.id });
  });
}

export function parseCreateOwnerArgs(
  argv: string[],
  password: string | undefined,
): OperatorCreateOwnerInput | { error: string } {
  const email = argValue(argv, 'email').toLowerCase();
  const fullName = argValue(argv, 'name');
  const reason = argValue(argv, 'reason');
  const operator = argValue(argv, 'operator');
  if (!email || !fullName || !reason || !operator) {
    return {
      error: 'Usage: PLATFORM_PASSWORD=<password> npm run platform:create-owner -- --email <email> --name "<full name>" ' +
        '--reason "<why>" --operator "<your name>" --confirm "CREATE OWNER <email>"',
    };
  }
  if (argValue(argv, 'confirm') !== `CREATE OWNER ${email}`) {
    return { error: `Refusing: --confirm must be exactly "CREATE OWNER ${email}".` };
  }
  if (!password) return { error: 'Set PLATFORM_PASSWORD in the environment; it is never taken as an argument.' };
  return { email, fullName, password, reason, operator };
}

export function parseDisableArgs(argv: string[]): { email: string; reason: string; operator: string } | { error: string } {
  const email = argValue(argv, 'email').toLowerCase();
  const reason = argValue(argv, 'reason');
  const operator = argValue(argv, 'operator');
  if (!email || !reason || !operator) {
    return {
      error: 'Usage: npm run platform:disable-account -- --email <email> --reason "<why>" ' +
        '--operator "<your name>" --confirm "DISABLE <email>"',
    };
  }
  if (argValue(argv, 'confirm') !== `DISABLE ${email}`) {
    return { error: `Refusing: --confirm must be exactly "DISABLE ${email}".` };
  }
  return { email, reason, operator };
}

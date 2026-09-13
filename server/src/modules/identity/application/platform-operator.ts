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

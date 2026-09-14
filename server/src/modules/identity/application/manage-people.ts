/**
 * M1's write surface beyond bootstrap: invite a person, grant authority, revoke it.
 *
 * Every use case here is authority-checked by the caller before it runs, and
 * checks its own invariants again regardless. The interface hides what a role
 * cannot do; these rules are what actually enforce it.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  AccountRepository, AssignmentListItem, InvitationRepository, PersonListItem,
  PersonRepository, RoleAssignmentRepository, RoleDefinitionRepository,
} from './ports.ts';
import type { ScopeType } from '../domain/scope.ts';
import { COLLEGE_ADMIN_ROLE_KEY } from './provision-initial-admin.ts';
import type { OtpRepository } from './otp-sign-in.ts';

export interface ManagePeopleDeps {
  uow: UnitOfWork;
  persons: PersonRepository;
  accounts: AccountRepository;
  assignments: RoleAssignmentRepository;
  roles: RoleDefinitionRepository;
  invitations: InvitationRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  tokens: TokenIssuer;
  invitationTtlHours: number;
  /** OTP-6: codes already sent to an old address are cancelled when it changes. */
  otp: OtpRepository;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface Actor {
  tenantId: string;
  personId: string;
}

/* ---------------------------------------------------------------- invite -- */

export interface InvitePersonInput {
  fullName: string;
  email: string;
  phone?: string | null;
  personType: 'staff' | 'student';
  /** Optional initial authority, granted in the same transaction as the invite. */
  role?: { roleKey: string; scopeType: ScopeType; scopeRefId: string | null; validTo: Date | null };
}

export async function invitePerson(
  deps: ManagePeopleDeps,
  actor: Actor,
  input: InvitePersonInput,
): Promise<Result<{ personId: string; accountId: string; invitationToken: string; expiresAt: Date }>> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Err(fail('VALIDATION_FAILED', 'Enter a valid email address.', {
      fieldErrors: { email: 'Invalid email address' },
    }));
  }
  if (input.fullName.trim().length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter the person’s full name.', {
      fieldErrors: { fullName: 'Required' },
    }));
  }

  const now = deps.clock.now();
  const correlationId = deps.ids.next();

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      // BR-15: one live account per person. A second invite to the same address
      // is a mistake worth naming, not a duplicate to create silently.
      const existing = await deps.persons.findByEmail(tx, email);
      if (existing) {
        return Err(fail('CONFLICT', 'Someone with that email already exists at this college.', {
          fieldErrors: { email: 'Already in use' },
        }));
      }

      const person = await deps.persons.create(tx, {
        id: deps.ids.next(),
        tenantId: actor.tenantId,
        fullName: input.fullName.trim(),
        primaryEmail: email,
        primaryPhone: input.phone ?? null,
        personType: input.personType,
        status: 'provisional',
      });

      let mfaRequired = false;
      let grantedAssignmentId: string | null = null;

      if (input.role) {
        const role = await deps.roles.findByKey(tx, input.role.roleKey);
        if (!role) return Err(fail('VALIDATION_FAILED', 'That role does not exist.'));
        if (!role.allowedScopeTypes.includes(input.role.scopeType)) {
          return Err(fail('VALIDATION_FAILED',
            `${role.name} cannot be granted at that level.`,
            { fieldErrors: { scopeType: 'Not allowed for this role' } }));
        }
        // BR-12: a role carrying critical permissions requires a second factor.
        mfaRequired = role.permissionKeys.some((k) => k === 'role.assign' || k === 'person.export');
        grantedAssignmentId = deps.ids.next();
      }

      const account = await deps.accounts.create(tx, {
        id: deps.ids.next(),
        tenantId: actor.tenantId,
        personId: person.id,
        loginIdentifier: email,
        status: 'invited',
        mfaRequired,
      });

      if (input.role && grantedAssignmentId) {
        const role = (await deps.roles.findByKey(tx, input.role.roleKey))!;
        await deps.assignments.create(tx, {
          id: grantedAssignmentId,
          tenantId: actor.tenantId,
          personId: person.id,
          roleId: role.id,
          scopeType: input.role.scopeType,
          scopeRefId: input.role.scopeRefId,
          validFrom: now,
          validTo: input.role.validTo,
          source: 'manual',
          grantedByPerson: actor.personId,
          grantedByPlatform: null,
          reason: 'Granted while inviting the person',
        });
      }

      const { token, hash } = deps.tokens.issueOpaqueToken();
      const expiresAt = new Date(now.getTime() + deps.invitationTtlHours * 3_600_000);
      await deps.invitations.issue(tx, {
        id: deps.ids.next(),
        tenantId: actor.tenantId,
        accountId: account.id,
        tokenHash: hash,
        expiresAt,
      });

      const base = {
        correlationId, tenantId: actor.tenantId,
        actorType: 'person' as const, actorId: actor.personId,
      };
      await deps.audit.record({
        ...base, action: 'person.created', subjectType: 'person', subjectId: person.id,
        after: { fullName: person.fullName, personType: person.personType },
      }, tx);
      await deps.audit.record({
        ...base, action: 'account.invited', subjectType: 'user_account', subjectId: account.id,
        after: { loginIdentifier: email, mfaRequired },
      }, tx);
      if (grantedAssignmentId) {
        await deps.audit.record({
          ...base, action: 'assignment.granted', subjectType: 'role_assignment',
          subjectId: grantedAssignmentId,
          scopeType: input.role!.scopeType, scopeRefId: input.role!.scopeRefId,
          after: { roleKey: input.role!.roleKey, source: 'manual' },
        }, tx);
      }

      return Ok({ personId: person.id, accountId: account.id, invitationToken: token, expiresAt });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/* --------------------------------------------------------------- contact -- */

/**
 * OTP-6 (AD-82): where a person's sign-in code goes.
 *
 * An email or mobile another person here already uses is refused: signing in
 * by it would become ambiguous. A person with an account keeps at least one.
 * A staff account signs in by its email, so its sign-in name moves with the
 * email and the old address stops working at once; codes already sent there
 * are cancelled. `undefined` leaves a field as it is; `null` clears it.
 */
export async function changeContact(
  deps: ManagePeopleDeps,
  actor: Actor,
  input: { personId: string; email?: string | null; phone?: string | null },
): Promise<Result<{ email: string | null; phone: string | null }>> {
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const person = await deps.persons.findById(tx, input.personId);
      if (!person) return Err(fail('NOT_FOUND', 'That person was not found.'));

      const email = input.email === undefined ? person.primaryEmail : input.email?.trim().toLowerCase() || null;
      const phone = input.phone === undefined ? person.primaryPhone : input.phone?.trim() || null;
      if (email && !EMAIL.test(email)) {
        return Err(fail('VALIDATION_FAILED', 'Enter a valid email address.', { fieldErrors: { email: 'Invalid email address' } }));
      }
      const phoneDigits = phone?.replace(/\D/g, '') ?? '';
      if (phone && phoneDigits.length < 10) {
        return Err(fail('VALIDATION_FAILED', 'Enter a mobile number with at least ten digits.', {
          fieldErrors: { phone: 'Too short' },
        }));
      }

      const account = await deps.accounts.findByPersonId(tx, person.id);
      const live = account && account.status !== 'deactivated' && account.status !== 'archived' ? account : null;
      if (live && !email && !phone) {
        return Err(fail('VALIDATION_FAILED', 'Keep an email or a mobile number: it is where their sign-in code goes.', {
          fieldErrors: { email: 'Required', phone: 'Required' },
        }));
      }
      const signsInByEmail = live !== null && person.primaryEmail !== null && live.loginIdentifier === person.primaryEmail;
      if (signsInByEmail && !email) {
        return Err(fail('VALIDATION_FAILED', 'They sign in with their email. Change it rather than remove it.', {
          fieldErrors: { email: 'Required' },
        }));
      }

      const clash = await deps.persons.findContactClash(tx, {
        excludePersonId: person.id,
        email: email !== person.primaryEmail ? email : null,
        phone10: phone && phone !== person.primaryPhone ? phoneDigits.slice(-10) : null,
      });
      if (clash.email) {
        return Err(fail('CONFLICT', 'Someone else at this college already uses that email.', { fieldErrors: { email: 'Already in use' } }));
      }
      if (clash.phone) {
        return Err(fail('CONFLICT', 'Someone else at this college already uses that mobile number.', {
          fieldErrors: { phone: 'Already in use' },
        }));
      }

      if (email === person.primaryEmail && phone === person.primaryPhone) return Ok({ email, phone });

      await deps.persons.updateContact(tx, person.id, { email, phone });
      const base = {
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person' as const, actorId: actor.personId,
      };
      if (live && signsInByEmail && email !== person.primaryEmail) {
        await deps.accounts.changeLoginIdentifier(tx, live.id, email!);
        await deps.audit.record({
          ...base, action: 'account.identifier_changed', subjectType: 'user_account', subjectId: live.id,
          before: { loginIdentifier: live.loginIdentifier }, after: { loginIdentifier: email },
        }, tx);
      }
      if (live) await deps.otp.revokeLive(tx, { accountId: live.id, platformAccountId: null }, deps.clock.now());
      await deps.audit.record({
        ...base, action: 'person.contact_changed', subjectType: 'person', subjectId: person.id,
        before: { email: person.primaryEmail, phone: person.primaryPhone }, after: { email, phone },
      }, tx);
      return Ok({ email, phone });
    });
  } catch (e) {
    // The sign-in name is unique per college; a race past the check lands here.
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', 'Someone else at this college already uses that email.', { fieldErrors: { email: 'Already in use' } }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/* ---------------------------------------------------------------- assign -- */

export interface AssignRoleInput {
  personId: string;
  roleKey: string;
  scopeType: ScopeType;
  scopeRefId: string | null;
  validTo: Date | null;
  reason?: string | null;
}

export async function assignRole(
  deps: ManagePeopleDeps,
  actor: Actor,
  input: AssignRoleInput,
): Promise<Result<{ assignmentId: string }>> {
  // Nobody edits their own authority, including an administrator. This is the
  // one role positioned to escalate its own privilege, so the rule is absolute.
  if (input.personId === actor.personId) {
    return Err(fail('FORBIDDEN', 'You cannot change your own access. Ask another administrator.'));
  }

  const now = deps.clock.now();
  if (input.validTo && input.validTo.getTime() <= now.getTime()) {
    return Err(fail('VALIDATION_FAILED', 'The end date must be in the future.', {
      fieldErrors: { validTo: 'Must be in the future' },
    }));
  }

  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const person = await deps.persons.findById(tx, input.personId);
      if (!person) return Err(fail('NOT_FOUND', 'That person was not found.'));

      const role = await deps.roles.findByKey(tx, input.roleKey);
      if (!role) return Err(fail('VALIDATION_FAILED', 'That role does not exist.'));
      if (!role.allowedScopeTypes.includes(input.scopeType)) {
        return Err(fail('VALIDATION_FAILED', `${role.name} cannot be granted at that level.`, {
          fieldErrors: { scopeType: 'Not allowed for this role' },
        }));
      }

      const id = deps.ids.next();
      try {
        await deps.assignments.create(tx, {
          id,
          tenantId: actor.tenantId,
          personId: input.personId,
          roleId: role.id,
          scopeType: input.scopeType,
          scopeRefId: input.scopeRefId,
          validFrom: now,
          validTo: input.validTo,
          source: 'manual',
          grantedByPerson: actor.personId,
          grantedByPlatform: null,
          reason: input.reason ?? null,
        });
      } catch (e) {
        // The partial unique index makes a duplicate grant impossible rather
        // than merely discouraged.
        if (e instanceof AppException && e.code === 'CONFLICT') {
          return Err(fail('CONFLICT', `${person.fullName} already holds ${role.name} there.`));
        }
        throw e;
      }

      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: actor.tenantId,
        actorType: 'person',
        actorId: actor.personId,
        action: 'assignment.granted',
        subjectType: 'role_assignment',
        subjectId: id,
        scopeType: input.scopeType,
        scopeRefId: input.scopeRefId,
        after: { roleKey: role.key, personId: input.personId, validTo: input.validTo },
        reason: input.reason ?? null,
      }, tx);

      return Ok({ assignmentId: id });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/* ---------------------------------------------------------------- revoke -- */

export async function revokeAssignment(
  deps: ManagePeopleDeps,
  actor: Actor,
  input: { assignmentId: string; reason: string },
): Promise<Result<{ revoked: true }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for removing this access.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const now = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const assignment = await deps.assignments.findActiveById(tx, input.assignmentId);
    if (!assignment || assignment.status !== 'active') {
      return Err(fail('NOT_FOUND', 'That access has already been removed.'));
    }
    if (assignment.personId === actor.personId) {
      return Err(fail('FORBIDDEN', 'You cannot change your own access. Ask another administrator.'));
    }

    // BR-8: the last administrator cannot be removed, or the college locks
    // itself out with no way back in that does not involve us.
    if (assignment.roleKey === COLLEGE_ADMIN_ROLE_KEY) {
      const remaining = await deps.assignments.countActiveByRoleKey(tx, COLLEGE_ADMIN_ROLE_KEY);
      if (remaining <= 1) {
        return Err(fail('CONFLICT',
          'This is the only administrator. Give someone else administrator access first.'));
      }
    }

    const revoked = await deps.assignments.revoke(tx, {
      id: input.assignmentId,
      revokedBy: actor.personId,
      reason: input.reason.trim(),
      at: now,
    });
    if (!revoked) return Err(fail('CONFLICT', 'That access was removed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(),
      tenantId: actor.tenantId,
      actorType: 'person',
      actorId: actor.personId,
      action: 'assignment.revoked',
      subjectType: 'role_assignment',
      subjectId: input.assignmentId,
      scopeType: assignment.scopeType,
      scopeRefId: assignment.scopeRefId,
      before: { roleKey: assignment.roleKey, status: 'active' },
      after: { status: 'revoked' },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ revoked: true as const });
  });
}

/* ------------------------------------------------------------------ read -- */

export function listPeople(
  deps: ManagePeopleDeps,
  actor: Actor,
  filter: { search?: string; personType?: string; accountStatus?: string; limit?: number },
): Promise<PersonListItem[]> {
  return deps.uow.run(actor.tenantId, (tx) =>
    deps.persons.list(tx, { ...filter, limit: Math.min(filter.limit ?? 100, 500) }),
  );
}

export function listAssignments(deps: ManagePeopleDeps, actor: Actor): Promise<AssignmentListItem[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.assignments.listActive(tx, 200));
}

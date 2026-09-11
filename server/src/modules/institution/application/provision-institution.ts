/**
 * W0 — provision a college with its initial administrator.
 *
 * The only workflow that creates a tenant, and the only one with no preconditions
 * inside the tenant, because the tenant does not exist yet.
 *
 * AD-20: institution, campus, person, account, assignment and invitation all
 * commit together. M2 orchestrates and calls M1's capability; it never writes
 * M1's tables, so ownership is intact while the transaction is shared.
 *
 * Invitation delivery is deliberately outside the transaction. Email cannot be
 * transactional, so the boundary sits exactly here: records commit together,
 * delivery is best-effort with visible status.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { CampusRepository, InstitutionRecord, InstitutionRepository } from './ports.ts';
import {
  provisionInitialAdmin,
  type Deps as IdentityProvisioningDeps,
} from '../../identity/application/provision-initial-admin.ts';

export interface ProvisionInstitutionInput {
  code: string;
  name: string;
  plan?: string;
  seatLimit?: number;
  timezone?: string;
  admin: { fullName: string; email: string; phone?: string | null };
  actingPlatformAccountId: string;
}

export interface ProvisionInstitutionOutput {
  institution: InstitutionRecord;
  adminPersonId: string;
  adminAccountId: string;
  invitationToken: string;
  invitationExpiresAt: Date;
}

export interface ProvisionInstitutionDeps {
  uow: UnitOfWork;
  institutions: InstitutionRepository;
  campuses: CampusRepository;
  identity: IdentityProvisioningDeps;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

export async function provisionInstitution(
  deps: ProvisionInstitutionDeps,
  input: ProvisionInstitutionInput,
): Promise<Result<ProvisionInstitutionOutput>> {
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(code)) {
    return Err(
      fail('VALIDATION_FAILED', 'Use 3 to 32 characters: lowercase letters, numbers and hyphens.', {
        fieldErrors: { code: 'Invalid institution code' },
      }),
    );
  }
  const email = input.admin.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Err(
      fail('VALIDATION_FAILED', 'Enter a valid email address for the administrator.', {
        fieldErrors: { 'admin.email': 'Invalid email address' },
      }),
    );
  }

  const institutionId = deps.ids.next();
  const correlationId = deps.ids.next();
  const now = deps.clock.now();

  try {
    // One transaction, per AD-20. Tenant context is set to the institution being
    // created: `institutions` carries no tenant_id and no RLS policy, because it
    // IS the tenant, so it can be inserted inside its own tenant's scope. Every
    // row that follows is then covered by the policy while still committing
    // together with it.
    const { created, admin } = await deps.uow.run(institutionId, async (tx) => {
      const clash = await deps.institutions.findByCode(tx, code);
      if (clash) throw new AppException('CONFLICT', 'That institution code is already taken.');

      const institution = await deps.institutions.create(tx, {
        id: institutionId,
        code,
        name: input.name.trim(),
        status: 'trial',
        plan: input.plan ?? 'standard',
        seatLimit: input.seatLimit ?? 500,
        timezone: input.timezone ?? 'Asia/Kolkata',
      });

      // AD-2: one implicit default campus, so campus scope is real from day one
      // and a single-campus institution never has to think about it.
      await deps.campuses.create(tx, {
        id: deps.ids.next(),
        tenantId: institutionId,
        name: 'Main Campus',
        code: 'main',
        isDefault: true,
      });

      const provisioned = await provisionInitialAdmin(deps.identity, tx, {
        tenantId: institutionId,
        fullName: input.admin.fullName.trim(),
        email,
        phone: input.admin.phone ?? null,
        grantedByPlatformAccountId: input.actingPlatformAccountId,
        correlationId,
      });

      await deps.audit.record(
        {
          correlationId,
          tenantId: institutionId,
          actorType: 'platform',
          actorId: input.actingPlatformAccountId,
          action: 'institution.provisioned',
          subjectType: 'institution',
          subjectId: institutionId,
          after: { code, name: institution.name, status: institution.status, at: now.toISOString() },
        },
        tx,
      );

      return { created: institution, admin: provisioned };
    });


    return Ok({
      institution: created,
      adminPersonId: admin.personId,
      adminAccountId: admin.accountId,
      invitationToken: admin.invitationToken,
      invitationExpiresAt: admin.invitationExpiresAt,
    });
  } catch (e) {
    if (e instanceof AppException) {
      return Err(fail(e.code, e.message));
    }
    throw e;
  }
}

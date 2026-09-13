/**
 * AD-70: a college's branding. Two writers and one public reader: the platform
 * sets it (at provisioning, or later on the college's page), the College Admin
 * changes it for their own college, and the app reads it by college code
 * before anybody signs in.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { InstitutionRecord, InstitutionRepository } from './ports.ts';
import { normaliseBranding } from '../domain/branding.ts';

export interface BrandingDeps {
  uow: UnitOfWork;
  institutions: InstitutionRepository;
  audit: AuditWriter;
  ids: IdGenerator;
}

export interface PublicBrand {
  code: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

const NOT_FOUND = 'No college uses that code. Check it with your college.';

/**
 * Unauthenticated. Unknown, suspended and closed colleges get one answer, so
 * the endpoint says nothing about a college nobody can use.
 */
export async function lookupPublicBrand(deps: BrandingDeps, code: string): Promise<Result<PublicBrand>> {
  const normal = code.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(normal)) return Err(fail('NOT_FOUND', NOT_FOUND));
  const college = await deps.uow.run(null, (tx) => deps.institutions.findByCode(tx, normal));
  if (!college || college.status === 'suspended' || college.status === 'closed') {
    return Err(fail('NOT_FOUND', NOT_FOUND));
  }
  return Ok({
    code: college.code,
    name: college.name,
    logoUrl: college.logoUrl ?? null,
    brandColor: college.brandColor ?? null,
  });
}

export type BrandingActor = { type: 'platform'; id: string } | { type: 'person'; id: string };

/**
 * The caller decides which college: the platform names one, a College Admin's
 * is always their own token's tenant. Pinned to a version, audited with both
 * the old and the new values.
 */
export async function changeBranding(
  deps: BrandingDeps,
  input: {
    institutionId: string;
    version: number;
    name: string;
    logoUrl: string | null;
    brandColor: string | null;
    actor: BrandingActor;
  },
): Promise<Result<InstitutionRecord>> {
  const parsed = normaliseBranding(input);
  if (!parsed.ok) {
    return Err(fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors: parsed.fieldErrors }));
  }
  const next = parsed.value;
  try {
    return await deps.uow.run(input.institutionId, async (tx) => {
      const current = await deps.institutions.findById(tx, input.institutionId);
      if (!current) return Err(fail('NOT_FOUND', 'That college was not found.'));
      if (current.status === 'closed') return Err(fail('CONFLICT', 'A closed college cannot be changed.'));
      const before = { name: current.name, logo_url: current.logoUrl ?? null, brand_color: current.brandColor ?? null };
      const after = { name: next.name, logo_url: next.logoUrl, brand_color: next.brandColor };
      if (JSON.stringify(before) === JSON.stringify(after)) return Err(fail('VALIDATION_FAILED', 'Nothing changed.'));

      const updated = await deps.institutions.setBranding(tx, input.institutionId, input.version, next);
      if (!updated) return Err(fail('CONFLICT', 'Somebody else changed this college. Reload and try again.'));
      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: input.institutionId,
        actorType: input.actor.type,
        actorId: input.actor.id,
        action: 'institution.branding_changed',
        subjectType: 'institution',
        subjectId: input.institutionId,
        before,
        after,
      }, tx);
      return Ok(updated);
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

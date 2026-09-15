/**
 * M2 — the organisational tree: campuses and the departments inside them.
 *
 * This is the structure M1 scopes authority against. Everything here exists to
 * make "Head of Department, Computer Science" a statement the system can check,
 * rather than a label.
 *
 * What M2 does not own: who holds authority over a unit. That is M1's, and this
 * module asks through a declared capability rather than reading its tables.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  CampusFence, CampusRecord, CampusRepository, DepartmentRecord, DepartmentRepository,
} from './ports.ts';
import { occupancyOfScope } from '../../identity/application/scope-capability.ts';

export interface OrgActor {
  tenantId: string;
  personId: string;
}

export interface ManageOrgDeps {
  uow: UnitOfWork;
  campuses: CampusRepository;
  departments: DepartmentRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/;

function validateUnit(name: string, code: string): Result<{ name: string; code: string }> {
  const trimmed = name.trim();
  const normalised = code.trim().toLowerCase();
  if (trimmed.length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter a name.', { fieldErrors: { name: 'Required' } }));
  }
  if (!CODE_PATTERN.test(normalised)) {
    return Err(fail('VALIDATION_FAILED', 'Use lowercase letters, numbers and hyphens.', {
      fieldErrors: { code: 'Invalid code' },
    }));
  }
  return Ok({ name: trimmed, code: normalised });
}

/* ---------------------------------------------------------------- read -- */

export function listCampuses(
  deps: ManageOrgDeps, actor: OrgActor, includeArchived = false,
): Promise<CampusRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.campuses.list(tx, includeArchived));
}

export function listDepartments(
  deps: ManageOrgDeps, actor: OrgActor, includeArchived = false,
): Promise<DepartmentRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.departments.list(tx, includeArchived));
}

/* ---------------------------------------------------- attendance fence -- */

/** SA-A1 (AD-83): the radius a fence may have, in metres. */
export const FENCE_RADIUS_M = { min: 25, max: 2000 } as const;

function fenceProblem(f: CampusFence): Result<CampusFence> {
  const invalid = (field: string, message: string) =>
    Err(fail('VALIDATION_FAILED', message, { fieldErrors: { [field]: message } }));
  if (!(f.latitude >= -90 && f.latitude <= 90)) return invalid('latitude', 'Latitude is between -90 and 90.');
  if (!(f.longitude >= -180 && f.longitude <= 180)) return invalid('longitude', 'Longitude is between -180 and 180.');
  // 0,0 is what a phone reports when it has no fix, never a college.
  if (f.latitude === 0 && f.longitude === 0) return invalid('latitude', 'That is not the campus location.');
  if (!Number.isInteger(f.radiusM) || f.radiusM < FENCE_RADIUS_M.min || f.radiusM > FENCE_RADIUS_M.max) {
    return invalid('radius_m', `The radius is ${FENCE_RADIUS_M.min} to ${FENCE_RADIUS_M.max} metres.`);
  }
  return Ok(f);
}

/**
 * Sets a campus's attendance fence, or (null) removes it, after which nobody
 * can punch in there. The centre is the campus's location, not a person's.
 */
export async function setCampusFence(
  deps: ManageOrgDeps, actor: OrgActor, input: { id: string; fence: CampusFence | null },
): Promise<Result<{ id: string }>> {
  if (input.fence) {
    const checked = fenceProblem(input.fence);
    if (!checked.ok) return checked;
  }
  return deps.uow.run(actor.tenantId, async (tx) => {
    const campus = await deps.campuses.findById(tx, input.id);
    if (!campus || campus.status !== 'active') return Err(fail('NOT_FOUND', 'That campus was not found.'));
    const changed = await deps.campuses.setFence(tx, input.id, input.fence);
    if (!changed) return Err(fail('CONFLICT', 'That campus was changed by someone else just now.'));
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: input.fence ? 'campus.fence_set' : 'campus.fence_cleared',
      subjectType: 'campus', subjectId: input.id, scopeType: 'campus', scopeRefId: input.id,
      before: { fence: campus.fence }, after: { fence: input.fence },
    }, tx);
    return Ok({ id: input.id });
  });
}

/* -------------------------------------------------------------- campus -- */

export async function createCampus(
  deps: ManageOrgDeps,
  actor: OrgActor,
  input: { name: string; code: string },
): Promise<Result<{ id: string }>> {
  const valid = validateUnit(input.name, input.code);
  if (!valid.ok) return valid;

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      await deps.campuses.create(tx, {
        id, tenantId: actor.tenantId, name: valid.value.name, code: valid.value.code,
        // Only provisioning creates the default campus. A second default would
        // make "the default" ambiguous, and a partial index enforces it anyway.
        isDefault: false,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'campus.created', subjectType: 'campus', subjectId: id,
        scopeType: 'campus', scopeRefId: id,
        after: { name: valid.value.name, code: valid.value.code },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', 'A campus already uses that code.', {
        fieldErrors: { code: 'Already in use' },
      }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function archiveCampus(
  deps: ManageOrgDeps,
  actor: OrgActor,
  input: { id: string; reason: string },
): Promise<Result<{ archived: true }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for archiving.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const campus = await deps.campuses.findById(tx, input.id);
    if (!campus || campus.status !== 'active') {
      return Err(fail('NOT_FOUND', 'That campus is already archived.'));
    }
    if (campus.isDefault) {
      return Err(fail('CONFLICT',
        'This is the main campus and cannot be archived. Every college keeps one.'));
    }

    // Archiving a campus with live departments would strand them: their parent
    // disappears while they stay active, and scope resolution walks upward.
    const departments = await deps.departments.countActive(tx, input.id);
    if (departments > 0) {
      return Err(fail('CONFLICT',
        `${campus.name} still has ${departments} active ${departments === 1 ? 'department' : 'departments'}. Archive or move them first.`));
    }

    const occupancy = await occupancyOfScope(tx, 'campus', input.id);
    if (occupancy.holders > 0) {
      return Err(fail('CONFLICT', accessRefusal(campus.name, occupancy.holders, occupancy.sample)));
    }

    const archived = await deps.campuses.archive(tx, input.id, actor.personId, at);
    if (!archived) return Err(fail('CONFLICT', 'That campus was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'campus.archived', subjectType: 'campus', subjectId: input.id,
      scopeType: 'campus', scopeRefId: input.id,
      before: { status: 'active', name: campus.name }, after: { status: 'archived' },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ archived: true as const });
  });
}

/* ---------------------------------------------------------- department -- */

export async function createDepartment(
  deps: ManageOrgDeps,
  actor: OrgActor,
  input: { campusId: string; name: string; code: string },
): Promise<Result<{ id: string }>> {
  const valid = validateUnit(input.name, input.code);
  if (!valid.ok) return valid;

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const campus = await deps.campuses.findById(tx, input.campusId);
      // Tenant isolation already prevents reaching another college's campus, so
      // "not found" here means archived or mistyped, not forbidden.
      if (!campus || campus.status !== 'active') {
        return Err(fail('VALIDATION_FAILED', 'Choose an active campus.', {
          fieldErrors: { campusId: 'Not available' },
        }));
      }

      await deps.departments.create(tx, {
        id, tenantId: actor.tenantId, campusId: input.campusId,
        name: valid.value.name, code: valid.value.code,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'department.created', subjectType: 'department', subjectId: id,
        scopeType: 'department', scopeRefId: id,
        after: { name: valid.value.name, code: valid.value.code, campusId: input.campusId },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', 'A department already uses that code.', {
        fieldErrors: { code: 'Already in use' },
      }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function renameDepartment(
  deps: ManageOrgDeps,
  actor: OrgActor,
  input: { id: string; name: string },
): Promise<Result<{ renamed: true }>> {
  const name = input.name.trim();
  if (name.length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter a name.', { fieldErrors: { name: 'Required' } }));
  }

  return deps.uow.run(actor.tenantId, async (tx) => {
    const before = await deps.departments.findById(tx, input.id);
    if (!before || before.status !== 'active') {
      return Err(fail('NOT_FOUND', 'That department was not found.'));
    }
    if (before.name === name) return Ok({ renamed: true as const });

    const renamed = await deps.departments.rename(tx, input.id, name);
    if (!renamed) return Err(fail('CONFLICT', 'That department was changed by someone else just now.'));

    // The code is not renamed with it: codes appear in identifiers and reports
    // that already exist elsewhere, so changing one silently rewrites history.
    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'department.renamed', subjectType: 'department', subjectId: input.id,
      scopeType: 'department', scopeRefId: input.id,
      before: { name: before.name }, after: { name },
    }, tx);

    return Ok({ renamed: true as const });
  });
}

export async function archiveDepartment(
  deps: ManageOrgDeps,
  actor: OrgActor,
  input: { id: string; reason: string },
): Promise<Result<{ archived: true }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for archiving.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const department = await deps.departments.findById(tx, input.id);
    if (!department || department.status !== 'active') {
      return Err(fail('NOT_FOUND', 'That department is already archived.'));
    }

    /*
     * Refuse rather than silently stranding authority.
     *
     * The alternative, letting the archive proceed and marking those
     * assignments invalid, hides the consequence at the moment the decision is
     * made. Naming the people forces the reorganisation to be done in the right
     * order: move them, then archive.
     */
    const occupancy = await occupancyOfScope(tx, 'department', input.id);
    if (occupancy.holders > 0) {
      return Err(fail('CONFLICT', accessRefusal(department.name, occupancy.holders, occupancy.sample)));
    }

    const archived = await deps.departments.archive(tx, input.id, actor.personId, at);
    if (!archived) return Err(fail('CONFLICT', 'That department was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'department.archived', subjectType: 'department', subjectId: input.id,
      scopeType: 'department', scopeRefId: input.id,
      before: { status: 'active', name: department.name }, after: { status: 'archived' },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ archived: true as const });
  });
}

function accessRefusal(unitName: string, holders: number, sample: string[]): string {
  const who = sample.slice(0, 3).join(', ');
  const rest = holders - Math.min(sample.length, 3);
  const names = rest > 0 ? `${who} and ${rest} ${rest === 1 ? 'other' : 'others'}` : who;
  return `${names} still ${holders === 1 ? 'holds' : 'hold'} access scoped to ${unitName}. Remove or move that access first.`;
}

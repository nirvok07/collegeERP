/**
 * The curriculum spine: programs, versions, courses, and the entries that place
 * a course inside a version.
 *
 * Every rule here serves one invariant (AD-3): a published curriculum version
 * must remain readable exactly as it was, for as long as any student bound to
 * it has a record. The database enforces immutability by trigger; this layer
 * refuses the same operations earlier and with a message a registrar can act on.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type {
  CourseRepository, CurriculumEntryRecord, CurriculumRepository,
  CurriculumVersionRecord, ProgramRecord, ProgramRepository,
} from './ports.ts';

export interface CurriculumActor {
  tenantId: string;
  personId: string;
}

export interface CurriculumDeps {
  uow: UnitOfWork;
  programs: ProgramRepository;
  courses: CourseRepository;
  curriculum: CurriculumRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
}

const CODE = /^[a-z0-9][a-z0-9-]{0,30}$/;

/* --------------------------------------------------------------- programs -- */

export async function createProgram(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: {
    departmentId: string; name: string; code: string; award?: string | null;
    durationYears: number; termType: 'semester' | 'annual';
  },
): Promise<Result<{ id: string }>> {
  const code = input.code.trim().toLowerCase();
  if (!CODE.test(code)) {
    return Err(fail('VALIDATION_FAILED', 'Use lowercase letters, numbers and hyphens.', {
      fieldErrors: { code: 'Invalid code' },
    }));
  }
  if (input.name.trim().length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter a program name.', {
      fieldErrors: { name: 'Required' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      await deps.programs.create(tx, {
        id, tenantId: actor.tenantId, departmentId: input.departmentId,
        name: input.name.trim(), code, award: input.award?.trim() || null,
        durationYears: input.durationYears, termType: input.termType,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'program.created', subjectType: 'program', subjectId: id,
        scopeType: 'program', scopeRefId: id,
        after: { name: input.name.trim(), code, durationYears: input.durationYears },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', 'A program already uses that code.', {
        fieldErrors: { code: 'Already in use' },
      }));
    }
    if (e instanceof AppException && e.code === 'VALIDATION_FAILED') {
      return Err(fail('VALIDATION_FAILED', 'Choose an active department.', {
        fieldErrors: { departmentId: 'Not available' },
      }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listPrograms(
  deps: CurriculumDeps, actor: CurriculumActor, includeArchived = false,
): Promise<ProgramRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.programs.list(tx, includeArchived));
}

export async function archiveProgram(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { id: string; reason: string },
): Promise<Result<{ archived: true }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason for archiving.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const program = await deps.programs.findById(tx, input.id);
    if (!program || program.status !== 'active') {
      return Err(fail('NOT_FOUND', 'That program is already archived.'));
    }

    // A published curriculum is a live obligation to whoever is bound to it.
    // Archiving the program above it would hide that obligation rather than end
    // it, which is the same failure AD-27 refuses for departments.
    if (program.publishedVersions > 0) {
      return Err(fail('CONFLICT',
        `${program.name} has ${program.publishedVersions} published ${program.publishedVersions === 1 ? 'curriculum' : 'curricula'} that students may be following. It cannot be archived.`));
    }

    const archived = await deps.programs.archive(tx, input.id, actor.personId, at);
    if (!archived) return Err(fail('CONFLICT', 'That program was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'program.archived', subjectType: 'program', subjectId: input.id,
      before: { status: 'active', name: program.name }, after: { status: 'archived' },
      reason: input.reason.trim(),
    }, tx);

    return Ok({ archived: true as const });
  });
}

/**
 * FB-2: a program's name and award can be corrected. Its code cannot: it is
 * what sections, students' records and published curricula are known by.
 */
export async function renameProgram(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { id: string; name: string; award: string | null },
): Promise<Result<{ updated: true }>> {
  const name = input.name.trim();
  if (name.length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter a program name.', { fieldErrors: { name: 'Required' } }));
  }
  const award = input.award?.trim() || null;

  return deps.uow.run(actor.tenantId, async (tx) => {
    const program = await deps.programs.findById(tx, input.id);
    if (!program || program.status !== 'active') {
      return Err(fail('NOT_FOUND', 'That program was not found.'));
    }
    const updated = await deps.programs.rename(tx, input.id, { name, award });
    if (!updated) return Err(fail('CONFLICT', 'That program was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'program.renamed', subjectType: 'program', subjectId: input.id,
      scopeType: 'program', scopeRefId: input.id,
      before: { name: program.name, award: program.award }, after: { name, award },
    }, tx);
    return Ok({ updated: true as const });
  });
}

/* ---------------------------------------------------------------- courses -- */

export async function createCourse(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { code: string; title: string; description?: string | null },
): Promise<Result<{ id: string }>> {
  const code = input.code.trim().toUpperCase();
  if (code.length < 2 || code.length > 20) {
    return Err(fail('VALIDATION_FAILED', 'Enter a course code, 2 to 20 characters.', {
      fieldErrors: { code: 'Invalid code' },
    }));
  }
  if (input.title.trim().length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter a course title.', {
      fieldErrors: { title: 'Required' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      await deps.courses.create(tx, {
        id, tenantId: actor.tenantId, code, title: input.title.trim(),
        description: input.description?.trim() || null,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'course.created', subjectType: 'course', subjectId: id,
        after: { code, title: input.title.trim() },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      // Codes are unique across every status: a code is an identity that
      // outlives the catalogue entry, because transcripts name it forever.
      return Err(fail('CONFLICT', `Course code ${code} is already used and cannot be reused.`, {
        fieldErrors: { code: 'Already in use' },
      }));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listCourses(
  deps: CurriculumDeps, actor: CurriculumActor, search: string | null,
): Promise<import('./ports.ts').CourseRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.courses.list(tx, search, false));
}

/**
 * Corrects a title. The code is never changed, because a transcript naming
 * CS301 must resolve to one course forever, and what that course was worth in a
 * given year lives on the curriculum entry rather than here.
 */
export async function retitleCourse(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { id: string; title: string; description?: string | null },
): Promise<Result<{ updated: true }>> {
  if (input.title.trim().length < 2) {
    return Err(fail('VALIDATION_FAILED', 'Enter a course title.', {
      fieldErrors: { title: 'Required' },
    }));
  }

  return deps.uow.run(actor.tenantId, async (tx) => {
    const before = await deps.courses.findById(tx, input.id);
    if (!before) return Err(fail('NOT_FOUND', 'That course was not found.'));

    const updated = await deps.courses.retitle(
      tx, input.id, input.title.trim(), input.description?.trim() || null,
    );
    if (!updated) return Err(fail('CONFLICT', 'That course was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'course.retitled', subjectType: 'course', subjectId: input.id,
      before: { title: before.title }, after: { title: input.title.trim() },
    }, tx);

    return Ok({ updated: true as const });
  });
}

/* ------------------------------------------------------------- curriculum -- */

export async function createDraft(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { programId: string; regulationYear: number; title?: string | null; totalTerms: number },
): Promise<Result<{ id: string }>> {
  const year = input.regulationYear;
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    return Err(fail('VALIDATION_FAILED', 'Enter a valid regulation year.', {
      fieldErrors: { regulationYear: 'Invalid year' },
    }));
  }
  if (!Number.isInteger(input.totalTerms) || input.totalTerms < 1 || input.totalTerms > 20) {
    return Err(fail('VALIDATION_FAILED', 'A program runs between 1 and 20 terms.', {
      fieldErrors: { totalTerms: 'Invalid' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const program = await deps.programs.findById(tx, input.programId);
      if (!program || program.status !== 'active') {
        return Err(fail('VALIDATION_FAILED', 'Choose an active program.', {
          fieldErrors: { programId: 'Not available' },
        }));
      }

      // A published version for this year already exists. Correcting it is an
      // erratum and creates a revision; this path would silently produce a
      // second competing definition of the same regulation.
      const published = await deps.curriculum.findPublished(tx, input.programId, year);
      if (published) {
        return Err(fail('CONFLICT',
          `Regulation ${year} is already published for ${program.name}. Create a revision to correct it, or a new regulation year to change requirements.`));
      }

      await deps.curriculum.createVersion(tx, {
        id, tenantId: actor.tenantId, programId: input.programId,
        regulationYear: year, revision: 1, title: input.title?.trim() || null,
        totalTerms: input.totalTerms,
      });
      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: 'curriculum.draft_created', subjectType: 'curriculum_version', subjectId: id,
        after: { programId: input.programId, regulationYear: year, revision: 1 },
      }, tx);
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', `A draft for regulation ${year} already exists.`));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function addEntry(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: {
    versionId: string; courseId: string; termNumber: number; credits: number;
    requirement: 'core' | 'elective' | 'audit'; electiveGroup?: string | null; sequence?: number;
  },
): Promise<Result<{ id: string }>> {
  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const version = await deps.curriculum.findVersion(tx, input.versionId);
      if (!version) return Err(fail('NOT_FOUND', 'That curriculum version was not found.'));
      if (version.status !== 'draft') {
        return Err(fail('CONFLICT', publishedRefusal(version)));
      }
      if (input.termNumber > version.totalTerms) {
        return Err(fail('VALIDATION_FAILED',
          `This curriculum has ${version.totalTerms} terms.`,
          { fieldErrors: { termNumber: 'Out of range' } }));
      }

      const course = await deps.courses.findById(tx, input.courseId);
      if (!course || course.status !== 'active') {
        return Err(fail('VALIDATION_FAILED', 'Choose an active course.', {
          fieldErrors: { courseId: 'Not available' },
        }));
      }
      if (input.requirement !== 'elective' && input.electiveGroup) {
        return Err(fail('VALIDATION_FAILED', 'Only electives belong to an elective group.', {
          fieldErrors: { electiveGroup: 'Not applicable' },
        }));
      }

      await deps.curriculum.addEntry(tx, {
        id, tenantId: actor.tenantId, versionId: input.versionId, courseId: input.courseId,
        termNumber: input.termNumber, credits: input.credits, requirement: input.requirement,
        electiveGroup: input.electiveGroup?.trim() || null, sequence: input.sequence ?? 0,
      });
      return Ok({ id });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', 'That course is already in this curriculum.'));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export async function removeEntry(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { versionId: string; entryId: string },
): Promise<Result<{ removed: true }>> {
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const version = await deps.curriculum.findVersion(tx, input.versionId);
      if (!version) return Err(fail('NOT_FOUND', 'That curriculum version was not found.'));
      if (version.status !== 'draft') return Err(fail('CONFLICT', publishedRefusal(version)));

      const removed = await deps.curriculum.removeEntry(tx, input.versionId, input.entryId);
      if (!removed) return Err(fail('NOT_FOUND', 'That course is not in this curriculum.'));
      return Ok({ removed: true as const });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/**
 * Publication is the point of no return, which is why it validates the whole
 * document rather than accepting whatever the draft happens to contain.
 */
export async function publishVersion(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { id: string },
): Promise<Result<{ published: true }>> {
  const at = deps.clock.now();
  return deps.uow.run(actor.tenantId, async (tx) => {
    const version = await deps.curriculum.findVersion(tx, input.id);
    if (!version) return Err(fail('NOT_FOUND', 'That curriculum version was not found.'));
    if (version.status !== 'draft') {
      return Err(fail('CONFLICT', `This curriculum is already ${version.status}.`));
    }

    const entries = await deps.curriculum.listEntries(tx, input.id);
    if (entries.length === 0) {
      return Err(fail('VALIDATION_FAILED',
        'Add at least one course before publishing. An empty curriculum would bind students to nothing.'));
    }

    // Every term must carry something. A gap is almost always an unfinished
    // draft rather than an intended year out, and publication is irreversible.
    const populated = new Set(entries.map((e) => e.termNumber));
    const empty: number[] = [];
    for (let term = 1; term <= version.totalTerms; term += 1) {
      if (!populated.has(term)) empty.push(term);
    }
    if (empty.length > 0) {
      return Err(fail('VALIDATION_FAILED',
        `No courses in ${empty.length === 1 ? 'term' : 'terms'} ${empty.join(', ')}. Publication cannot be undone, so every term must be complete.`));
    }

    const published = await deps.curriculum.publish(tx, input.id, actor.personId, at);
    if (!published) return Err(fail('CONFLICT', 'That curriculum was changed by someone else just now.'));

    await deps.audit.record({
      correlationId: deps.ids.next(), tenantId: actor.tenantId,
      actorType: 'person', actorId: actor.personId,
      action: 'curriculum.published', subjectType: 'curriculum_version', subjectId: input.id,
      before: { status: 'draft' },
      after: {
        status: 'published',
        regulationYear: version.regulationYear,
        revision: version.revision,
        courses: entries.length,
        totalCredits: entries.reduce((sum, e) => sum + e.credits, 0),
      },
    }, tx);

    return Ok({ published: true as const });
  });
}

/**
 * A successor: either a new regulation year, or a revision correcting this one.
 *
 * The distinction is the caller's to make and the system records which, because
 * an erratum rebinds students and an amendment does not. Entries are copied so
 * the author starts from what exists rather than retyping a document.
 */
export async function createSuccessor(
  deps: CurriculumDeps,
  actor: CurriculumActor,
  input: { fromVersionId: string; kind: 'revision' | 'amendment'; regulationYear?: number; reason: string },
): Promise<Result<{ id: string; copiedEntries: number }>> {
  if (!input.reason?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'Give a reason. It is recorded against the new version.', {
      fieldErrors: { reason: 'Required' },
    }));
  }

  const id = deps.ids.next();
  try {
    return await deps.uow.run(actor.tenantId, async (tx) => {
      const source = await deps.curriculum.findVersion(tx, input.fromVersionId);
      if (!source) return Err(fail('NOT_FOUND', 'That curriculum version was not found.'));
      if (source.status === 'draft') {
        return Err(fail('CONFLICT', 'This curriculum is still a draft. Edit it directly.'));
      }

      const year = input.kind === 'revision'
        ? source.regulationYear
        : (input.regulationYear ?? source.regulationYear + 1);
      const revision = input.kind === 'revision' ? source.revision + 1 : 1;

      if (input.kind === 'amendment' && year <= source.regulationYear) {
        return Err(fail('VALIDATION_FAILED',
          'A new regulation must come after the one it replaces.',
          { fieldErrors: { regulationYear: 'Must be later' } }));
      }

      await deps.curriculum.createVersion(tx, {
        id, tenantId: actor.tenantId, programId: source.programId,
        regulationYear: year, revision, title: source.title, totalTerms: source.totalTerms,
      });
      const copied = await deps.curriculum.copyEntries(tx, input.fromVersionId, id, () => deps.ids.next());

      await deps.audit.record({
        correlationId: deps.ids.next(), tenantId: actor.tenantId,
        actorType: 'person', actorId: actor.personId,
        action: input.kind === 'revision' ? 'curriculum.revision_started' : 'curriculum.amendment_started',
        subjectType: 'curriculum_version', subjectId: id,
        before: { fromVersion: input.fromVersionId, regulationYear: source.regulationYear, revision: source.revision },
        after: { regulationYear: year, revision, copiedEntries: copied },
        reason: input.reason.trim(),
      }, tx);

      return Ok({ id, copiedEntries: copied });
    });
  } catch (e) {
    if (e instanceof AppException && e.code === 'CONFLICT') {
      return Err(fail('CONFLICT', 'A draft already exists for that regulation year.'));
    }
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

export function listVersions(
  deps: CurriculumDeps, actor: CurriculumActor, programId: string | null,
): Promise<CurriculumVersionRecord[]> {
  return deps.uow.run(actor.tenantId, (tx) => deps.curriculum.listVersions(tx, programId));
}

export function readVersion(
  deps: CurriculumDeps, actor: CurriculumActor, id: string,
): Promise<{ version: CurriculumVersionRecord | null; entries: CurriculumEntryRecord[] }> {
  return deps.uow.run(actor.tenantId, async (tx) => {
    const version = await deps.curriculum.findVersion(tx, id);
    if (!version) return { version: null, entries: [] };
    return { version, entries: await deps.curriculum.listEntries(tx, id) };
  });
}

function publishedRefusal(version: CurriculumVersionRecord): string {
  return `Regulation ${version.regulationYear} is ${version.status} and cannot be changed. Students may be following it. Create a revision to correct an error, or a new regulation year to change requirements.`;
}

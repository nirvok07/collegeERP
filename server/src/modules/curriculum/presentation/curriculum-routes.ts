import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePermission } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { institutionScope } from '../../identity/domain/scope.ts';
import {
  addEntry, archiveProgram, createCourse, createDraft, createProgram, createSuccessor,
  listCourses, listPrograms, listVersions, publishVersion, readVersion, removeEntry,
  renameProgram, retitleCourse, type CurriculumActor,
} from '../application/manage-curriculum.ts';

const programBody = z.object({
  department_id: z.string().uuid(),
  name: z.string().min(2).max(160),
  code: z.string().min(1).max(32),
  award: z.string().max(80).optional(),
  duration_years: z.number().positive().max(10),
  term_type: z.enum(['semester', 'annual']).default('semester'),
});
const renameProgramBody = z.object({
  name: z.string().min(2).max(160),
  award: z.string().max(80).nullable().optional(),
});
const courseBody = z.object({
  code: z.string().min(2).max(20),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
});
const retitleBody = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
});
const draftBody = z.object({
  program_id: z.string().uuid(),
  regulation_year: z.number().int(),
  title: z.string().max(160).optional(),
  total_terms: z.number().int().positive().max(20),
});
const entryBody = z.object({
  course_id: z.string().uuid(),
  term_number: z.number().int().positive().max(20),
  credits: z.number().min(0).max(30),
  requirement: z.enum(['core', 'elective', 'audit']).default('core'),
  elective_group: z.string().max(60).optional(),
  sequence: z.number().int().min(0).max(999).optional(),
});
const successorBody = z.object({
  kind: z.enum(['revision', 'amendment']),
  regulation_year: z.number().int().optional(),
  reason: z.string().min(1).max(500),
});
const archiveBody = z.object({ reason: z.string().min(1).max(500) });

export async function registerCurriculumRoutes(app: FastifyInstance, c: Container) {
  const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): CurriculumActor => ({
    tenantId: req.actor!.tenantId!,
    personId: req.actor!.sub,
  });

  const invalid = (issues: z.ZodIssue[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.join('.')] = issue.message;
    return fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors });
  };

  // Reading the curriculum is broad: anyone who can see people can see what the
  // college teaches. Authoring it is department management.
  const canRead = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'person.read', institutionScope());
  const canWrite = (req: never, reply: never) =>
    requirePermission(c, req, reply, 'department.manage', institutionScope());

  /* -------------------------------------------------------------- programs */

  app.get('/programs', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const archived = (req.query as { archived?: string }).archived === 'true';
    const rows = await listPrograms(c.curriculum, actorOf(req), archived);
    return sendOk(reply, rows.map((p) => ({
      id: p.id, name: p.name, code: p.code, award: p.award,
      department_id: p.departmentId, department_name: p.departmentName,
      duration_years: p.durationYears, term_type: p.termType, status: p.status,
      published_versions: p.publishedVersions,
    })));
  });

  app.post('/programs', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = programBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createProgram(c.curriculum, actorOf(req), {
      departmentId: parsed.data.department_id,
      name: parsed.data.name,
      code: parsed.data.code,
      award: parsed.data.award ?? null,
      durationYears: parsed.data.duration_years,
      termType: parsed.data.term_type,
    }), 201);
  });

  app.patch('/programs/:id', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) {
      return sendFailure(reply, fail('NOT_FOUND', 'That program was not found.'));
    }
    const parsed = renameProgramBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await renameProgram(c.curriculum, actorOf(req), {
      id, name: parsed.data.name, award: parsed.data.award ?? null,
    }));
  });

  app.post('/programs/:id/archive', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = archiveBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await archiveProgram(c.curriculum, actorOf(req), {
      id: (req.params as { id: string }).id, reason: parsed.data.reason,
    }));
  });

  /* --------------------------------------------------------------- courses */

  app.get('/courses', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const q = (req.query as { q?: string }).q?.trim() || null;
    const rows = await listCourses(c.curriculum, actorOf(req), q);
    return sendOk(reply, rows.map((course) => ({
      id: course.id, code: course.code, title: course.title,
      description: course.description, status: course.status,
      used_in_versions: course.usedInVersions,
    })));
  });

  app.post('/courses', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = courseBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createCourse(c.curriculum, actorOf(req), {
      code: parsed.data.code, title: parsed.data.title,
      description: parsed.data.description ?? null,
    }), 201);
  });

  app.patch('/courses/:id', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = retitleBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await retitleCourse(c.curriculum, actorOf(req), {
      id: (req.params as { id: string }).id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
    }));
  });

  /* ------------------------------------------------------------ curriculum */

  app.get('/curriculum-versions', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const programId = (req.query as { program_id?: string }).program_id ?? null;
    const rows = await listVersions(c.curriculum, actorOf(req), programId);
    return sendOk(reply, rows.map(serialiseVersion));
  });

  app.get('/curriculum-versions/:id', async (req, reply) => {
    if (!(await canRead(req as never, reply as never))) return reply;
    const { version, entries } = await readVersion(
      c.curriculum, actorOf(req), (req.params as { id: string }).id,
    );
    if (!version) return sendFailure(reply, fail('NOT_FOUND', 'That curriculum was not found.'));
    return sendOk(reply, {
      ...serialiseVersion(version),
      // Grouped by term, which is how a curriculum is read and how both clients
      // render it, rather than as one flat list they each have to bucket.
      terms: Array.from({ length: version.totalTerms }, (_, i) => i + 1).map((term) => ({
        term_number: term,
        courses: entries.filter((e) => e.termNumber === term).map((e) => ({
          id: e.id, course_id: e.courseId, code: e.courseCode, title: e.courseTitle,
          credits: e.credits, requirement: e.requirement, elective_group: e.electiveGroup,
        })),
        credits: entries.filter((e) => e.termNumber === term)
          .reduce((sum, e) => sum + e.credits, 0),
      })),
    });
  });

  app.post('/curriculum-versions', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = draftBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createDraft(c.curriculum, actorOf(req), {
      programId: parsed.data.program_id,
      regulationYear: parsed.data.regulation_year,
      title: parsed.data.title ?? null,
      totalTerms: parsed.data.total_terms,
    }), 201);
  });

  app.post('/curriculum-versions/:id/entries', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = entryBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await addEntry(c.curriculum, actorOf(req), {
      versionId: (req.params as { id: string }).id,
      courseId: parsed.data.course_id,
      termNumber: parsed.data.term_number,
      credits: parsed.data.credits,
      requirement: parsed.data.requirement,
      electiveGroup: parsed.data.elective_group ?? null,
      sequence: parsed.data.sequence ?? 0,
    }), 201);
  });

  app.delete('/curriculum-versions/:id/entries/:entryId', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const params = req.params as { id: string; entryId: string };
    return sendResult(reply, await removeEntry(c.curriculum, actorOf(req), {
      versionId: params.id, entryId: params.entryId,
    }));
  });

  app.post('/curriculum-versions/:id/publish', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    return sendResult(reply, await publishVersion(c.curriculum, actorOf(req), {
      id: (req.params as { id: string }).id,
    }));
  });

  app.post('/curriculum-versions/:id/successor', async (req, reply) => {
    if (!(await canWrite(req as never, reply as never))) return reply;
    const parsed = successorBody.safeParse(req.body);
    if (!parsed.success) return sendFailure(reply, invalid(parsed.error.issues));
    return sendResult(reply, await createSuccessor(c.curriculum, actorOf(req), {
      fromVersionId: (req.params as { id: string }).id,
      kind: parsed.data.kind,
      regulationYear: parsed.data.regulation_year,
      reason: parsed.data.reason,
    }), 201);
  });
}

function serialiseVersion(v: import('../application/ports.ts').CurriculumVersionRecord) {
  return {
    id: v.id,
    program_id: v.programId,
    program_name: v.programName,
    regulation_year: v.regulationYear,
    revision: v.revision,
    title: v.title,
    status: v.status,
    total_terms: v.totalTerms,
    published_at: v.publishedAt,
    superseded_by: v.supersededById,
    course_count: v.entryCount,
    total_credits: v.totalCredits,
    // Stated rather than inferred by each client, because getting it wrong
    // means offering an edit that the database will refuse.
    editable: v.status === 'draft',
  };
}

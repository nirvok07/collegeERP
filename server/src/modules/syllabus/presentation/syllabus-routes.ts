import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk } from '../../../infrastructure/http/server.ts';
import { fail } from '../../../core/errors.ts';
import {
  downloadSyllabus, listSyllabi, removeSyllabus, uploadSyllabus,
} from '../application/syllabus-service.ts';
import type { SyllabusActor, SyllabusScope } from '../application/ports.ts';

/** Soft cap so a misplaced large file cannot be buffered wholesale. */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const actorOf = (req: { actor?: { sub: string; tenantId: string | null } }): SyllabusActor => ({
  tenantId: req.actor!.tenantId!,
  personId: req.actor!.sub,
});

/**
 * Multipart parser for the single upload route. Deliberately dependency-free
 * (the codebase keeps vendor/SDK out), handling exactly what this module sends:
 * text fields (course_id, academic_year_id) plus one PDF part. A raw-body
 * content-type parser keeps the whole body in memory, which is acceptable for
 * a ≤10 MB document and keeps the module testable offline.
 */
function registerMultipartParser(app: FastifyInstance) {
  // Fastify's documented shape for a buffered content-type: callback style.
  // An async handler here would be treated as a stream consumer and drain into
  // nothing, which is exactly the intermittent "no file parsed" we hit.
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_req: FastifyRequest, body: Buffer, done: (e: Error | null, b?: unknown) => void) => done(null, body));
}

interface ParsedPart { name: string; filename?: string; contentType?: string; value: Buffer }

function parseMultipart(body: Buffer, contentType: string | undefined): ParsedPart[] {
  const match = /boundary=([^;]+)/i.exec(contentType ?? '');
  if (!match) return [];
  const boundary = Buffer.from('--' + match[1]!.trim());
  const parts: ParsedPart[] = [];

  let index = body.indexOf(boundary);
  while (index !== -1) {
    const start = index + boundary.length;
    const next = body.indexOf(boundary, start);
    if (next === -1) break;

    // Peek at the bytes right after the next boundary: if "--" follows, it's the
    // closing delimiter. The segment between index and next is the LAST real part.
    const isClosing = body.subarray(next + boundary.length, next + boundary.length + 2).toString() === '--';

    const segment = body.subarray(start, next);
    // Header block ends at the first blank line (\r\n\r\n) after `\r\n`.
    const headerEnd = segment.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headers = segment.subarray(0, headerEnd).toString('latin1');
      const value = segment.subarray(headerEnd + 4, segment.length - 2); // strip trailing \r\n

      const nameMatch = /name="([^"]*)"/.exec(headers);
      const filenameMatch = /filename="([^"]*)"/.exec(headers);
      const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
      parts.push({
        name: nameMatch?.[1] ?? '',
        filename: filenameMatch?.[1],
        contentType: ctMatch?.[1]?.trim(),
        value,
      });
    }
    if (isClosing) break;
    index = next;
  }
  return parts;
}

export async function registerSyllabusRoutes(app: FastifyInstance, c: Container) {
  registerMultipartParser(app);

  /**
   * The union of every permission the actor currently holds anywhere in the
   * college — the same source the /me surfaces use. A section-scoped faculty
   * member's syllabus.read survives here even though institutionScope() would
   * not contain their grant, so the syllabus scope is decided by what the
   * repository derives from their assignments, not by the target we pass.
   */
  const hasPerm = async (req: FastifyRequest, permission: string): Promise<boolean> => {
    const authority = await c.authority.authorityFor(req.actor!.tenantId!, req.actor!.sub);
    return c.authority.permissions(authority).has(permission);
  };

  /** Upload authority also means college-wide list scope; a plain faculty
   *  member (syllabus.read only) sees only their taught courses. */
  const scopeFor = async (req: FastifyRequest): Promise<SyllabusScope> =>
    (await hasPerm(req, 'syllabus.upload')) ? 'all' : 'staff';

  const gate = async (req: FastifyRequest, reply: FastifyReply, permission: string): Promise<boolean> => {
    if (await hasPerm(req, permission)) return true;
    sendFailure(reply, fail('FORBIDDEN', 'You do not have access to do that.'));
    return false;
  };

  /* -------------------------------------------------------------- upload */

  /*
   * M12: an administrator uploads or replaces one course/year syllabus. The
   * body is multipart with course_id and academic_year_id fields and a single
   * pdf file. The client never passes a course it cannot manage — the upsert
   * writes to the syllabus's own tenant, and a course/year id that does not
   * belong to the tenant fails the FK.
   */
  app.post('/syllabus/upload', async (req, reply) => {
    try {
      if (!(await gate(req, reply, 'syllabus.upload'))) return;
      const body = req.body as Buffer | undefined;
      const parts = body ? parseMultipart(body, req.headers['content-type'] as string | undefined) : [];
      console.log('DEBUG parts', parts.map(p => ({ name: p.name, filename: p.filename, contentType: p.contentType, valueLen: p.value.length })));
      const field = (n: string) => parts.find((p) => p.name === n && !p.filename)?.value.toString('utf8').trim();

      const courseId = field('course_id');
      const academicYearId = field('academic_year_id');
      const file = parts.find((p) => p.filename);
      if (!courseId || !academicYearId || !file) {
        return sendFailure(reply, fail('VALIDATION_FAILED', 'Choose a course, an academic year and a PDF file.'));
      }
      if (file.contentType && file.contentType !== 'application/pdf') {
        return sendFailure(reply, fail('VALIDATION_FAILED', 'The syllabus must be a PDF.'));
      }
      if (file.value.length === 0) return sendFailure(reply, fail('VALIDATION_FAILED', 'The file is empty.'));
      if (file.value.length > MAX_FILE_BYTES) return sendFailure(reply, fail('VALIDATION_FAILED', 'The file is larger than 10 MB.'));

      const actor = actorOf(req);
      console.log('DEBUG actor', actor);
      const result = await uploadSyllabus(c.syllabus, actor, {
        courseId,
        academicYearId,
        bytes: file.value,
        fileName: file.filename!,
        contentType: file.contentType ?? 'application/pdf',
        byteSize: file.value.length,
      });
      if (!result.ok) return sendFailure(reply, result.error);
      return sendOk(reply, serialise(result.value), 201);
    } catch (e) {
      console.log('UPLOAD ERROR', (e as Error).message, (e as Error).stack);
      throw e;
    }
  });

  /* -------------------------------------------------------------- list */

  /*
   * M12: the syllabi the signed-in staff member may see. College Admin / HOD
   * (syllabus.upload) sees the whole college; a teacher (syllabus.read only)
   * sees their own taught courses. Scope is derived server-side, never from a
   * client-supplied course id.
   */
  app.get('/syllabus', async (req, reply) => {
    if (!(await gate(req, reply, 'syllabus.read'))) return;
    const actor = actorOf(req);
    const result = await listSyllabi(c.syllabus, actor, await scopeFor(req));
    return sendOk(reply, result.ok ? result.value.map(serialise) : []);
  });

  /* ------------------------------------------------- student self-read */

  /*
   * M12, ST-style: a student's own syllabi. Self-scoped like /me/fees: the
   * signed-in person is never a parameter, so nobody reads another student's
   * files through here. A non-student with a session gets FORBIDDEN.
   */
  app.get('/me/syllabus', async (req, reply) => {
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
      return sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    }
    const actor = actorOf(req);
    const me = await c.uow.run(actor.tenantId, (tx) => c.studentSelf.whoAmI(tx, actor.personId));
    if (!me) return sendFailure(reply, fail('FORBIDDEN', 'Only students have their own syllabi.'));
    const result = await listSyllabi(c.syllabus, actor, 'student');
    return sendOk(reply, result.ok ? result.value.map(serialise) : []);
  });

  /* ----------------------------------------------------------- download */

  /*
   * M12: stream the PDF back. The same accessible-scope gate as list runs on
   * the id, so a student or teacher cannot pull another course's file by
   * guessing an id. Emitted inline with a filename so the browser saves it
   * under the course document's name.
   */
  app.get('/syllabus/:id/download', async (req, reply) => {
    if (!(await gate(req, reply, 'syllabus.read'))) return;
    const actor = actorOf(req);
    const result = await downloadSyllabus(c.syllabus, actor, await scopeFor(req), (req.params as { id: string }).id);
    if (!result.ok) return sendFailure(reply, result.error);
    reply
      .header('Content-Type', result.value.contentType)
      .header('Content-Length', String(result.value.byteSize))
      .header('Content-Disposition', `attachment; filename="${sanitise(result.value.fileName)}"`)
      .send(result.value.bytes);
  });

  /* ------------------------------------------------------------- delete */

  app.delete('/syllabus/:id', async (req, reply) => {
    if (!(await gate(req, reply, 'syllabus.upload'))) return;
    const actor = actorOf(req);
    const result = await removeSyllabus(c.syllabus, actor, (req.params as { id: string }).id);
    if (!result.ok) return sendFailure(reply, result.error);
    return sendOk(reply, { deleted: true });
  });
}

function serialise(r: any) {
  return {
    id: r.id,
    course_id: r.courseId,
    course_code: r.courseCode,
    course_title: r.courseTitle,
    academic_year_id: r.academicYearId,
    academic_year_name: r.academicYearName,
    file_name: r.fileName,
    content_type: r.contentType,
    byte_size: r.byteSize,
    uploaded_by: r.uploadedBy,
    uploaded_by_name: r.uploadedByName,
    uploaded_at: r.uploadedAt.toISOString(),
  };
}

function sanitise(name: string): string {
  return name.replace(/["\r\n]/g, '_').replace(/[^\x20-\x7E]/g, '_');
}
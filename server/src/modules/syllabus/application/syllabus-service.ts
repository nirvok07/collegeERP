import { Ok, Err, type Result } from '../../../core/result.ts';
import { fail } from '../../../core/errors.ts';
import type {
  SyllabusActor, SyllabusDeps, SyllabusDownloadFile, SyllabusRecord, SyllabusScope, SyllabusUploadInput,
} from './ports.ts';

/** Uploads a new syllabus PDF, stores the binary behind the media port, then
 *  records (or replaces) the row. A replace deletes the superseded binary only
 *  after the DB row points at the new one, so a failed insert never orphans the
 *  active file. */
export async function uploadSyllabus(
  deps: SyllabusDeps,
  actor: SyllabusActor,
  input: Omit<SyllabusUploadInput, 'mediaReference' | 'uploadedBy'> & { bytes: Buffer },
): Promise<Result<SyllabusRecord>> {
  const id = deps.ids.next();
  const stored = await deps.media.upload({
    bytes: input.bytes,
    contentType: input.contentType,
    folder: `${actor.tenantId}/syllabus`,
    fileName: `${id}.pdf`,
  });

  const { replaced, previousReference } = await deps.uow.run(actor.tenantId, (tx) =>
    deps.syllabus.upsert(tx, {
      id,
      tenantId: actor.tenantId,
      courseId: input.courseId,
      academicYearId: input.academicYearId,
      mediaReference: stored.reference,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      uploadedBy: actor.personId,
    }),
  );
  if (replaced && previousReference) {
    await deps.media.delete(previousReference).catch(() => undefined);
  }

  const record = await deps.uow.run(actor.tenantId, (tx) =>
    deps.syllabus.findById(tx, actor.tenantId, id),
  );
  return record ? Ok(record) : Err(fail('NOT_FOUND', 'Syllabus was not found.'));
}

/** The syllabi the signed-in staff member may see: everything when they hold
 *  upload authority, otherwise only their taught courses. */
export async function listSyllabi(deps: SyllabusDeps, actor: SyllabusActor, scope: SyllabusScope): Promise<Result<SyllabusRecord[]>> {
  const records = await deps.uow.run(actor.tenantId, (tx) =>
    deps.syllabus.listForActor(tx, actor.tenantId, actor.personId, scope),
  );
  return Ok(records);
}

/** Streaming download: the file bytes for a syllabus the caller may see, or
 *  NOT_FOUND when the id is outside their scope. */
export async function downloadSyllabus(
  deps: SyllabusDeps,
  actor: SyllabusActor,
  scope: SyllabusScope,
  id: string,
): Promise<Result<SyllabusDownloadFile>> {
  const row = await deps.uow.run(actor.tenantId, (tx) =>
    deps.syllabus.findAccessible(tx, actor.tenantId, actor.personId, scope, id),
  );
  if (!row) return Err(fail('NOT_FOUND', 'Syllabus was not found.'));
  const file = await deps.media.read(row.mediaReference);
  if (!file) return Err(fail('NOT_FOUND', 'Syllabus file was not found.'));
  return Ok({
    bytes: file.bytes,
    contentType: file.contentType,
    byteSize: file.byteSize,
    fileName: row.fileName,
  });
}

/** Removes a syllabus and its binary, gated by the admin 'all' scope. */
export async function removeSyllabus(deps: SyllabusDeps, actor: SyllabusActor, id: string): Promise<Result<true>> {
  const found = await deps.uow.run(actor.tenantId, (tx) =>
    deps.syllabus.findAccessible(tx, actor.tenantId, actor.personId, 'all', id),
  );
  if (!found) return Err(fail('NOT_FOUND', 'Syllabus was not found.'));
  const { mediaReference } = await deps.uow.run(actor.tenantId, (tx) => deps.syllabus.remove(tx, actor.tenantId, id));
  if (mediaReference) await deps.media.delete(mediaReference).catch(() => undefined);
  return Ok(true);
}
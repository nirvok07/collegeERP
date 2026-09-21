import type { Tx } from '../../../shared/application/unit-of-work.ts';

/** The signed-in actor, tenant + person, at the module boundary. */
export interface SyllabusActor {
  tenantId: string;
  personId: string;
}

/** How a caller's syllabi are scoped. 'all' = the whole college (admin/HOD);
 *  'staff' = only courses the person currently teaches; 'student' = only
 *  courses in the person's live section. */
export type SyllabusScope = 'all' | 'staff' | 'student';

export interface SyllabusRecord {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  academicYearId: string;
  academicYearName: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date;
}

export interface SyllabusUploadInput {
  courseId: string;
  academicYearId: string;
  mediaReference: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  uploadedBy: string;
}

export interface SyllabusRepository {
  /** One syllabus per (course, year). Reports whether it replaced an earlier
   *  one and, if so, the media reference that is now orphaned and should be
   *  deleted. */
  upsert(tx: Tx, input: SyllabusUploadInput & { tenantId: string; id: string }): Promise<{
    replaced: boolean;
    previousReference: string | null;
  }>;
  findById(tx: Tx, tenantId: string, id: string): Promise<SyllabusRecord | null>;
  /** The syllabi a given caller may see, server-scoped — never trusting the
   *  client to pass course ids. */
  listForActor(tx: Tx, tenantId: string, personId: string, scope: SyllabusScope): Promise<SyllabusRecord[]>;
  /** Whether an identified syllabus is in this caller's accessible set. The
   *  download/delete gate runs the same scope as list, so a student cannot
   *  probe another course's file by id. */
  findAccessible(tx: Tx, tenantId: string, personId: string, scope: SyllabusScope, id: string): Promise<SyllabusFileRow | null>;
  /** Removes a syllabus row; returns the media reference to delete, or null
   *  when the row did not exist. */
  remove(tx: Tx, tenantId: string, id: string): Promise<{ removed: boolean; mediaReference: string | null }>;
}

/** A syllabus row as the download path needs it, before bytes are fetched. */
export interface SyllabusFileRow {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  mediaReference: string;
}

export type SyllabusDownloadFile = {
  bytes: Buffer;
  contentType: string;
  byteSize: number;
  fileName: string;
};

export interface SyllabusDeps {
  uow: { run<T>(tenantId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> };
  media: {
    upload(input: { bytes: Buffer; contentType: string; folder: string; fileName: string }): Promise<{
      reference: string; contentType: string; byteSize: number;
    }>;
    read(reference: string): Promise<{ bytes: Buffer; contentType: string; byteSize: number } | null>;
    delete(reference: string): Promise<void>;
  };
  syllabus: SyllabusRepository;
  ids: { next(): string };
  clock: { now(): Date };
}
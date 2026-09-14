import type { Tx } from '../../../shared/application/unit-of-work.ts';

export interface ProgramRecord {
  id: string;
  departmentId: string;
  departmentName: string;
  name: string;
  code: string;
  award: string | null;
  durationYears: number;
  termType: 'semester' | 'annual';
  status: 'active' | 'archived';
  publishedVersions: number;
}

export interface CourseRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: 'active' | 'archived';
  /** How many curriculum versions place this course. Drives safe archival. */
  usedInVersions: number;
}

export type CurriculumStatus = 'draft' | 'published' | 'superseded' | 'discarded';

export interface CurriculumVersionRecord {
  id: string;
  programId: string;
  programName: string;
  regulationYear: number;
  revision: number;
  title: string | null;
  status: CurriculumStatus;
  totalTerms: number;
  publishedAt: Date | null;
  supersededById: string | null;
  entryCount: number;
  totalCredits: number;
}

export interface CurriculumEntryRecord {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termNumber: number;
  credits: number;
  requirement: 'core' | 'elective' | 'audit';
  electiveGroup: string | null;
  sequence: number;
}

export interface ProgramRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; departmentId: string; name: string; code: string;
    award: string | null; durationYears: number; termType: 'semester' | 'annual';
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<ProgramRecord | null>;
  list(tx: Tx, includeArchived: boolean): Promise<ProgramRecord[]>;
  archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
  /** Name and award only: the code is permanent, as a course's is. */
  rename(tx: Tx, id: string, input: { name: string; award: string | null }): Promise<boolean>;
}

export interface CourseRepository {
  create(tx: Tx, input: {
    id: string; tenantId: string; code: string; title: string; description: string | null;
  }): Promise<void>;
  findById(tx: Tx, id: string): Promise<CourseRecord | null>;
  findByCode(tx: Tx, code: string): Promise<CourseRecord | null>;
  list(tx: Tx, search: string | null, includeArchived: boolean): Promise<CourseRecord[]>;
  /** Title only. Code is identity and is never renamed. */
  retitle(tx: Tx, id: string, title: string, description: string | null): Promise<boolean>;
}

export interface CurriculumRepository {
  createVersion(tx: Tx, input: {
    id: string; tenantId: string; programId: string; regulationYear: number;
    revision: number; title: string | null; totalTerms: number;
  }): Promise<void>;
  findVersion(tx: Tx, id: string): Promise<CurriculumVersionRecord | null>;
  listVersions(tx: Tx, programId: string | null): Promise<CurriculumVersionRecord[]>;
  /** The live published version for a regulation year, if any. */
  findPublished(tx: Tx, programId: string, regulationYear: number): Promise<CurriculumVersionRecord | null>;
  publish(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
  supersede(tx: Tx, id: string, byVersionId: string, at: Date): Promise<boolean>;
  discard(tx: Tx, id: string, at: Date): Promise<boolean>;

  listEntries(tx: Tx, versionId: string): Promise<CurriculumEntryRecord[]>;
  addEntry(tx: Tx, input: {
    id: string; tenantId: string; versionId: string; courseId: string;
    termNumber: number; credits: number; requirement: string;
    electiveGroup: string | null; sequence: number;
  }): Promise<void>;
  removeEntry(tx: Tx, versionId: string, entryId: string): Promise<boolean>;
  /** Copies every entry from one version to another, for a successor draft. */
  copyEntries(tx: Tx, fromVersionId: string, toVersionId: string, newId: () => string): Promise<number>;
}

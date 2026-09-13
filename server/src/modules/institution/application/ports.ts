import type { Tx } from '../../../shared/application/unit-of-work.ts';

export interface InstitutionRecord {
  id: string;
  code: string;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'closed';
  plan: string;
  seatLimit: number;
  timezone: string;
  version: number;
  /** Set only while suspended: the status reactivation returns to (migration 019). */
  suspendedFrom?: 'trial' | 'active' | null;
  statusChangedAt?: Date | null;
  createdAt?: Date;
  /** AD-70: shown before sign-in. An https URL until uploads exist. */
  logoUrl?: string | null;
  /** AD-70: '#RRGGBB'; the app decides whether it is legible as an accent. */
  brandColor?: string | null;
}

export interface InstitutionRepository {
  create(tx: Tx, input: Omit<InstitutionRecord, 'version'>): Promise<InstitutionRecord>;
  findByCode(tx: Tx, code: string): Promise<InstitutionRecord | null>;
  findById(tx: Tx, id: string): Promise<InstitutionRecord | null>;
  list(tx: Tx, limit: number): Promise<InstitutionRecord[]>;
  /** Pinned to a version; null when somebody changed it first. The trigger rules on legality. */
  setStatus(tx: Tx, id: string, version: number, status: InstitutionRecord['status']): Promise<InstitutionRecord | null>;
  /** SA-4a. Pinned to a version; null when somebody changed the college first. */
  setPlan(tx: Tx, id: string, version: number, plan: string, seatLimit: number): Promise<InstitutionRecord | null>;
  /** AD-70. Pinned to a version; null when somebody changed the college first. */
  setBranding(
    tx: Tx,
    id: string,
    version: number,
    branding: { name: string; logoUrl: string | null; brandColor: string | null },
  ): Promise<InstitutionRecord | null>;
}

export interface CampusRecord {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  isDefault: boolean;
  status: 'active' | 'archived';
  departmentCount: number;
  version: number;
}

export interface DepartmentRecord {
  id: string;
  tenantId: string;
  campusId: string;
  campusName: string;
  name: string;
  code: string;
  status: 'active' | 'archived';
  version: number;
}

export interface CampusRepository {
  create(
    tx: Tx,
    input: { id: string; tenantId: string; name: string; code: string; isDefault: boolean },
  ): Promise<{ id: string }>;
  findById(tx: Tx, id: string): Promise<CampusRecord | null>;
  list(tx: Tx, includeArchived: boolean): Promise<CampusRecord[]>;
  rename(tx: Tx, id: string, name: string): Promise<boolean>;
  archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
}

export interface DepartmentRepository {
  create(
    tx: Tx,
    input: { id: string; tenantId: string; campusId: string; name: string; code: string },
  ): Promise<{ id: string }>;
  findById(tx: Tx, id: string): Promise<DepartmentRecord | null>;
  list(tx: Tx, includeArchived: boolean): Promise<DepartmentRecord[]>;
  rename(tx: Tx, id: string, name: string): Promise<boolean>;
  archive(tx: Tx, id: string, by: string, at: Date): Promise<boolean>;
  countActive(tx: Tx, campusId: string): Promise<number>;
}

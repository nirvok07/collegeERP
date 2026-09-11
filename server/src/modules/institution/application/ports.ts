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
}

export interface InstitutionRepository {
  create(tx: Tx, input: Omit<InstitutionRecord, 'version'>): Promise<InstitutionRecord>;
  findByCode(tx: Tx, code: string): Promise<InstitutionRecord | null>;
  findById(tx: Tx, id: string): Promise<InstitutionRecord | null>;
  list(tx: Tx, limit: number): Promise<InstitutionRecord[]>;
}

export interface CampusRepository {
  create(
    tx: Tx,
    input: { id: string; tenantId: string; name: string; code: string; isDefault: boolean },
  ): Promise<{ id: string }>;
}

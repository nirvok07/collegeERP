/**
 * Whether a college's users may use the API right now (AD-60).
 *
 * The rule itself is accessDenial in the institution domain. This applies it
 * at the two boundaries a session passes through: every bearer-authenticated
 * request, and session renewal. Nowhere else checks a college's status.
 *
 * Status is cached briefly because this runs on every request. A change made
 * through the lifecycle clears the entry at once in this process; another
 * process catches up within the TTL.
 */
import type { Failure } from '../../core/errors.ts';
import type { UnitOfWork } from '../../shared/application/unit-of-work.ts';
import type { InstitutionRepository, InstitutionRecord } from '../../modules/institution/application/ports.ts';
import { accessDenial } from '../../modules/institution/domain/lifecycle.ts';

export class TenantAccessGate {
  private readonly cache = new Map<string, { status: InstitutionRecord['status'] | null; at: number }>();

  constructor(
    private readonly uow: UnitOfWork,
    private readonly institutions: InstitutionRepository,
    private readonly ttlMs = 15_000,
    private readonly now: () => number = Date.now,
  ) {}

  async denialFor(tenantId: string): Promise<Failure | null> {
    const cached = this.cache.get(tenantId);
    let status = cached && this.now() - cached.at < this.ttlMs ? cached.status : undefined;
    if (status === undefined) {
      const record = await this.uow.run(null, (tx) => this.institutions.findById(tx, tenantId));
      status = record?.status ?? null;
      this.cache.set(tenantId, { status, at: this.now() });
    }
    return accessDenial(status);
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}

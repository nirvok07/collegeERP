import type { AuditEvent, AuditWriter, IdGenerator } from '../../shared/application/ports.ts';
import type { UnitOfWork } from '../../shared/application/unit-of-work.ts';
import { clientOf } from './unit-of-work.ts';
import type { Tx } from '../../shared/application/unit-of-work.ts';

/**
 * P6. Insert only. There is no update or delete method here and none in the
 * database grants, so history cannot be rewritten through the application.
 *
 * When a transaction is supplied the event commits with the work it describes,
 * which is what makes "the action happened but was not audited" impossible.
 */
export class PgAuditWriter implements AuditWriter {
  constructor(
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async record(event: AuditEvent, tx?: Tx): Promise<void> {
    const write = async (tx: Tx) => {
      await clientOf(tx).query(
        `INSERT INTO audit_events
           (id, tenant_id, correlation_id, actor_type, actor_id, action, subject_type,
            subject_id, scope_type, scope_ref_id, before_state, after_state, reason, ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          this.ids.next(),
          event.tenantId,
          event.correlationId,
          event.actorType,
          event.actorId,
          event.action,
          event.subjectType,
          event.subjectId,
          event.scopeType ?? null,
          event.scopeRefId ?? null,
          event.before === undefined ? null : JSON.stringify(event.before),
          event.after === undefined ? null : JSON.stringify(event.after),
          event.reason ?? null,
          event.ipHash ?? null,
        ],
      );
    };
    if (tx) return write(tx);
    return this.uow.run(event.tenantId, write);
  }
}

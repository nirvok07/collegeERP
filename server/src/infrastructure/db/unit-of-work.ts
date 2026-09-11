import type { Tx, UnitOfWork } from '../../shared/application/unit-of-work.ts';
import type { Pool, PoolClient } from './pool.ts';
import { AppException } from '../../core/errors.ts';

/**
 * A transaction carrying its tenant scope. The client is not part of the Tx
 * interface the application sees; repositories recover it here, so no use case
 * can reach a database handle.
 */
export interface PgTx extends Tx {
  readonly client: PoolClient;
}

export function clientOf(tx: Tx): PoolClient {
  const client = (tx as PgTx).client;
  if (!client) throw new AppException('UNKNOWN', 'Transaction is not a PostgreSQL transaction');
  return client;
}

export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(tenantId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // set_config with is_local = true scopes the setting to this transaction.
      // That is what makes row level security work correctly behind a transaction
      // pooler, where connections are not stable across statements.
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId ?? '']);

      const tx: PgTx = { tenantId, client };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw translate(e);
    } finally {
      client.release();
    }
  }
}

/** Postgres errors become AppException at the boundary; no pg type escapes infrastructure. */
function translate(e: unknown): unknown {
  const code = (e as { code?: string } | null)?.code;
  if (code === '23505') return new AppException('CONFLICT', 'That record already exists.', e);
  if (code === '23503') return new AppException('VALIDATION_FAILED', 'A referenced record does not exist.', e);
  if (code === '23514') return new AppException('VALIDATION_FAILED', 'That value is not allowed.', e);
  if (code === '42501') return new AppException('FORBIDDEN', 'Not permitted.', e);
  return e;
}

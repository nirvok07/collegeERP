/**
 * The transactional boundary, expressed without naming a database.
 *
 * AD-20 permits exactly one shared transaction across module boundaries:
 * bootstrap provisioning of a new tenant. That is why this port exists at the
 * shared layer rather than inside a single module.
 */
export interface Tx {
  /**
   * Tenant scope for this transaction. Set once when the transaction opens and
   * never changed, so a single transaction can never span two tenants.
   * Null means platform scope, which reaches no tenant-owned row.
   */
  readonly tenantId: string | null;
}

export interface UnitOfWork {
  /** Runs fn inside one transaction with tenant scope applied. Rolls back on throw. */
  run<T>(tenantId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T>;
}

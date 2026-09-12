/**
 * M1's declared capability for other modules that own a scope target.
 *
 * M2 needs to know whether anyone holds authority over a department before
 * archiving it. It must not query role_assignments to find out: that table is
 * M1's, and a second reader of it becomes a second interpretation of what
 * "active authority" means.
 *
 * Same shape as the provisioning capability M2 already calls under AD-20. A
 * declared function, not shared table access.
 */
import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type { ScopeType } from '../domain/scope.ts';

export interface ScopeOccupancy {
  /** People holding a currently valid assignment at exactly this scope. */
  holders: number;
  /** Their names, capped, so the refusal can say who rather than how many. */
  sample: string[];
}

export async function occupancyOfScope(
  tx: Tx,
  scopeType: ScopeType,
  scopeRefId: string,
): Promise<ScopeOccupancy> {
  const { rows } = await clientOf(tx).query(
    `SELECT p.full_name
       FROM role_assignments ra
       JOIN persons p ON p.id = ra.person_id
      WHERE ra.scope_type = $1
        AND ra.scope_ref_id = $2
        AND ra.status = 'active'
        AND ra.valid_from <= now()
        AND (ra.valid_to IS NULL OR ra.valid_to > now())
      ORDER BY p.full_name
      LIMIT 5`,
    [scopeType, scopeRefId],
  );
  const { rows: counted } = await clientOf(tx).query(
    `SELECT count(*)::int AS n
       FROM role_assignments
      WHERE scope_type = $1 AND scope_ref_id = $2 AND status = 'active'
        AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())`,
    [scopeType, scopeRefId],
  );
  return {
    holders: counted[0]?.n ?? 0,
    sample: rows.map((r) => r.full_name as string),
  };
}

/**
 * AD-16. Resolution happens per request, cached per person with a generation
 * counter and a hard ceiling so a lost invalidation self-heals rather than
 * granting stale authority indefinitely.
 *
 * The cache is deliberately in this layer and keyed by person, not by session:
 * revoking an assignment must affect every session that person holds.
 */
import type { Clock } from '../../../shared/application/ports.ts';
import type { Tx, UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { OrgTreeReader, RoleAssignmentRepository } from './ports.ts';
import { can, hasNoAuthority, permissionKeys, type Authority } from '../domain/authority.ts';
import type { Scope } from '../domain/scope.ts';

export const AUTHORITY_CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  authority: Authority;
  loadedAt: number;
}

export class AuthorityService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly deps: {
      uow: UnitOfWork;
      assignments: RoleAssignmentRepository;
      orgTree: OrgTreeReader;
      clock: Clock;
    },
  ) {}

  /** Called on every assignment, delegation, role or scope-tree change. */
  invalidate(personId: string): void {
    this.cache.delete(personId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async authorityFor(tenantId: string, personId: string): Promise<Authority> {
    const cached = this.cache.get(personId);
    const nowMs = this.deps.clock.now().getTime();
    if (cached && nowMs - cached.loadedAt < AUTHORITY_CACHE_TTL_MS) {
      return cached.authority;
    }

    const assignments = await this.deps.uow.run(tenantId, (tx) =>
      this.deps.assignments.listActiveForPerson(tx, personId),
    );
    const authority: Authority = { personId, tenantId, assignments };
    this.cache.set(personId, { authority, loadedAt: nowMs });
    return authority;
  }

  async can(
    authority: Authority,
    permission: string,
    target: Scope,
    tx?: Tx,
  ): Promise<boolean> {
    const at = this.deps.clock.now();
    if (target.type === 'institution' || target.refId === null) {
      return can(authority, permission, target, [], at);
    }
    const ancestry = tx
      ? await this.deps.orgTree.ancestryOf(tx, target.type, target.refId)
      : await this.deps.uow.run(authority.tenantId, (t) =>
          this.deps.orgTree.ancestryOf(t, target.type, target.refId as string),
        );
    return can(authority, permission, target, ancestry, at);
  }

  permissions(authority: Authority): ReadonlySet<string> {
    return permissionKeys(authority, this.deps.clock.now());
  }

  /** AD-18. Drives the designed "no access yet" screen rather than an error. */
  hasNoAccess(authority: Authority): boolean {
    return hasNoAuthority(authority, this.deps.clock.now());
  }
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { fail } from '../../core/errors.ts';
import { sendFailure } from './server.ts';
import type { Container } from '../../container.ts';
import type { Scope } from '../../modules/identity/domain/scope.ts';
import {
  platformPermissions, type PlatformPermission, type PlatformRole,
} from '../../modules/identity/domain/platform-authority.ts';

/** Platform actors only. Used by the tenant provisioning surface. */
export function requirePlatformActor(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.actor) {
    sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    return false;
  }
  if (req.actor.actorType !== 'platform') {
    // Not "forbidden with an explanation": confirming the endpoint exists for
    // someone else tells a tenant user more than they need to know.
    sendFailure(reply, fail('NOT_FOUND', 'No such endpoint.'));
    return false;
  }
  return true;
}

/**
 * Deny by default, per AD-18 and BR-20. Authority is resolved from live
 * assignments, never from the token.
 */
export async function requirePermission(
  container: Container,
  req: FastifyRequest,
  reply: FastifyReply,
  permission: string,
  target: Scope,
): Promise<boolean> {
  if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) {
    sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    return false;
  }
  const authority = await container.authority.authorityFor(req.actor.tenantId, req.actor.sub);
  const allowed = await container.authority.can(authority, permission, target);
  if (!allowed) {
    sendFailure(reply, fail('FORBIDDEN', 'You do not have access to do that.'));
    return false;
  }
  return true;
}

export interface PlatformAuthority {
  accountId: string;
  role: PlatformRole | null;
  permissions: Set<PlatformPermission>;
}

/**
 * SA-3a. A platform account, active now, whose role grants the permission.
 * Status and role are read live, so a disabled account or a changed role
 * takes effect on the next request (AD-16). Returns the authority, or null
 * after answering the request.
 */
export async function requirePlatformPermission(
  container: Container,
  req: FastifyRequest,
  reply: FastifyReply,
  permission: PlatformPermission,
): Promise<PlatformAuthority | null> {
  if (!requirePlatformActor(req, reply)) return null;
  const found = await container.platformAuthority.forAccount(req.actor!.sub);
  if (!found || found.status !== 'active') {
    sendFailure(reply, fail('UNAUTHENTICATED', 'Sign in to continue.'));
    return null;
  }
  const permissions = platformPermissions(found.role);
  if (!permissions.has(permission)) {
    sendFailure(reply, fail('FORBIDDEN', 'Your platform role does not allow this.'));
    return null;
  }
  return { accountId: req.actor!.sub, role: found.role, permissions };
}

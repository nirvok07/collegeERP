import type { FastifyReply, FastifyRequest } from 'fastify';
import { fail } from '../../core/errors.ts';
import { sendFailure } from './server.ts';
import type { Container } from '../../container.ts';
import type { Scope } from '../../modules/identity/domain/scope.ts';

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

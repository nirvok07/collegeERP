import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import type { Container } from '../../container.ts';
import { httpStatusFor, type Failure } from '../../core/errors.ts';
import type { Result } from '../../core/result.ts';
import { registerAuthRoutes } from '../../modules/identity/presentation/auth-routes.ts';
import { registerInstitutionRoutes } from '../../modules/institution/presentation/institution-routes.ts';
import type { AccessTokenClaims } from '../../shared/application/ports.ts';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: AccessTokenClaims;
  }
}

export const ipHashOf = (req: FastifyRequest): string =>
  createHash('sha256').update(req.ip ?? '').digest('hex').slice(0, 32);

/** Success envelope, per the approved API contract. */
export function sendOk(reply: any, data: unknown, status = 200) {
  return reply.status(status).send({
    data,
    meta: { server_time: new Date().toISOString() },
  });
}

/** Error envelope. `message` is user-safe; `detail` is logged and never sent. */
export function sendFailure(reply: any, failure: Failure, log?: (m: unknown) => void) {
  if (failure.detail) log?.({ code: failure.code, detail: failure.detail });
  return reply.status(httpStatusFor(failure.code)).send({
    error: {
      code: failure.code,
      message: failure.message,
      ...(failure.fieldErrors ? { field_errors: failure.fieldErrors } : {}),
    },
  });
}

export function sendResult<T>(reply: any, result: Result<T>, status = 200, log?: (m: unknown) => void) {
  return result.ok ? sendOk(reply, result.value, status) : sendFailure(reply, result.error, log);
}

export async function buildServer(container: Container): Promise<FastifyInstance> {
  const app = Fastify({
    logger: container.config.NODE_ENV !== 'test',
    genReqId: () => crypto.randomUUID(),
  });

  app.decorateRequest('actor', undefined);

  /**
   * Identity only. A valid token proves who the caller is and nothing about what
   * they may do: authority is resolved per request, per AD-16.
   */
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const claims = container.authenticate.tokens.verifyAccessToken(header.slice(7));
    if (claims) req.actor = claims;
  });

  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error }, 'unhandled request error');
    return reply.status(500).send({
      error: { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' },
    });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }),
  );

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(async (v1) => {
    await registerAuthRoutes(v1, container);
    await registerInstitutionRoutes(v1, container);
  }, { prefix: '/v1' });

  return app;
}

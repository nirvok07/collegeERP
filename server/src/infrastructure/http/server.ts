import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { createHash } from 'node:crypto';
import type { Container } from '../../container.ts';
import { httpStatusFor, type Failure } from '../../core/errors.ts';
import type { Result } from '../../core/result.ts';
import { registerAuthRoutes } from '../../modules/identity/presentation/auth-routes.ts';
import { registerInstitutionRoutes } from '../../modules/institution/presentation/institution-routes.ts';
import { registerPeopleRoutes } from '../../modules/identity/presentation/people-routes.ts';
import { registerCurriculumRoutes } from '../../modules/curriculum/presentation/curriculum-routes.ts';
import { registerTeachingRoutes } from '../../modules/teaching/presentation/teaching-routes.ts';
import { registerOfferingRoutes } from '../../modules/teaching/presentation/offering-routes.ts';
import { registerDeliveryRoutes } from '../../modules/delivery/presentation/delivery-routes.ts';
import { registerEnrolmentRoutes } from '../../modules/enrolment/presentation/enrolment-routes.ts';
import { registerAttendanceRoutes } from '../../modules/attendance/presentation/attendance-routes.ts';
import { registerAssessmentRoutes } from '../../modules/assessment/presentation/assessment-routes.ts';
import type { AccessTokenClaims } from '../../shared/application/ports.ts';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: AccessTokenClaims;
  }
}

export const REFRESH_COOKIE = 'college_erp_rt';

/**
 * The refresh token is the long-lived credential, so the browser must never be
 * able to read it: httpOnly puts it beyond JavaScript, which is what makes an
 * XSS bug unable to steal a session. Path is narrowed to the auth routes so it
 * is not attached to ordinary API calls.
 */
export function refreshCookieOptions(config: { NODE_ENV: string; REFRESH_TOKEN_TTL_DAYS: number }) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.NODE_ENV === 'production',
    path: '/v1/auth',
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400,
  };
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
   * An explicit allowlist, never a wildcard. Credentials are not used: the
   * console sends a bearer token, so no cookie needs to cross the origin and
   * the CSRF surface stays closed.
   */
  const allowed = new Set(
    container.config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  );
  await app.register(cors, {
    origin: (origin, done) => {
      if (!origin || allowed.has(origin)) return done(null, true);
      done(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
    // Credentials are required for the refresh cookie. Safe only because the
    // origin list is explicit: a wildcard origin with credentials is refused by
    // browsers, and would be wrong here anyway.
    credentials: true,
    maxAge: 600,
  });

  await app.register(cookie, { secret: container.config.COOKIE_SECRET });

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
    await registerPeopleRoutes(v1, container);
    await registerCurriculumRoutes(v1, container);
    await registerTeachingRoutes(v1, container);
    await registerOfferingRoutes(v1, container);
    await registerDeliveryRoutes(v1, container);
    await registerEnrolmentRoutes(v1, container);
    await registerAttendanceRoutes(v1, container);
    await registerAssessmentRoutes(v1, container);
  }, { prefix: '/v1' });

  return app;
}

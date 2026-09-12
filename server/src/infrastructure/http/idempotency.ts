/**
 * Replay-safe writes (AD-58), the first slice of the offline outbox.
 *
 * A route marked `idempotent` honours an `Idempotency-Key` header. The outcome
 * of the first request is stored against the key, scoped to the calling person
 * and bound to a hash of the request, and a resend gets that outcome back
 * instead of being applied again or refused as a false conflict.
 *
 * Opt-in per route, deliberately. Only field writes are marked; no other route
 * stores a response, so nothing carrying a secret is ever kept.
 *
 * See docs/blueprint/capabilities/offline-outbox.md.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../../container.ts';
import { clientOf } from '../db/unit-of-work.ts';
import { fail } from '../../core/errors.ts';
import { sendFailure } from './server.ts';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Marks a route whose writes are made replay-safe by an Idempotency-Key. */
    idempotent?: boolean;
  }
  interface FastifyRequest {
    idempotency?: HeldKey;
  }
}

interface HeldKey {
  tenantId: string;
  actorId: string;
  key: string;
}

type Reservation =
  | { kind: 'reserved' }
  | { kind: 'in_progress' }
  | { kind: 'replay'; hash: string; status: number; body: unknown };

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function registerIdempotency(app: FastifyInstance, container: Container): void {
  const uow = container.uow;

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.routeOptions.config?.idempotent) return;
    const header = req.headers['idempotency-key'];
    // Without a key a request behaves exactly as it always has.
    if (header === undefined) return;
    // An unauthenticated request is answered by the route itself. A key only
    // means something against a person, because it is scoped to one.
    if (!req.actor || req.actor.actorType !== 'person' || !req.actor.tenantId) return;

    const key = Array.isArray(header) ? header[0] : header;
    if (!key || !KEY_PATTERN.test(key)) {
      return sendFailure(reply, fail('VALIDATION_FAILED',
        'An Idempotency-Key is 8 to 128 letters, digits, dashes or underscores.'));
    }

    const held: HeldKey = { tenantId: req.actor.tenantId, actorId: req.actor.sub, key };
    const hash = hashOf(req);
    const reservation = await reserve(held, {
      method: req.method,
      route: req.routeOptions.url ?? req.url,
      target: req.url,
      hash,
    });

    switch (reservation.kind) {
      case 'reserved':
        req.idempotency = held;
        return;
      case 'in_progress':
        return sendFailure(reply, fail('CONFLICT',
          'An identical request is still being processed. Try again in a moment.'));
      case 'replay':
        // The same key for a different request is a client mistake, and must
        // never be answered with the first request's outcome.
        if (reservation.hash !== hash) {
          return sendFailure(reply, fail('VALIDATION_FAILED',
            'This Idempotency-Key was already used for a different request.'));
        }
        return reply
          .code(reservation.status)
          .header('idempotent-replayed', 'true')
          .send(reservation.body);
    }
  });

  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const held = req.idempotency;
    if (!held) return payload;
    // A server error releases the key so the write can be retried. Anything
    // else is the answer to that request, kept and replayed exactly.
    if (reply.statusCode >= 500) await release(held);
    else await complete(held, reply.statusCode, parse(payload));
    return payload;
  });

  async function reserve(
    held: HeldKey,
    request: { method: string; route: string; target: string; hash: string },
  ): Promise<Reservation> {
    return uow.run(held.tenantId, async (tx) => {
      const db = clientOf(tx);
      const inserted = await db.query(
        `INSERT INTO idempotency_keys
           (tenant_id, actor_id, key, method, route, target, request_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, actor_id, key) DO NOTHING
         RETURNING key`,
        [held.tenantId, held.actorId, held.key, request.method, request.route,
          request.target, request.hash],
      );
      if ((inserted.rowCount ?? 0) > 0) return { kind: 'reserved' } as const;

      // An expired outcome, or a reservation abandoned by a crash, is taken
      // over. The WHERE repeats the test so two resends cannot both win.
      const taken = await db.query(
        `UPDATE idempotency_keys
            SET status = 'in_progress', method = $4, route = $5, target = $6,
                request_hash = $7, response_status = NULL, response_body = NULL,
                created_at = now(), completed_at = NULL
          WHERE tenant_id = $1 AND actor_id = $2 AND key = $3
            AND (created_at < now() - interval '24 hours'
                 OR (status = 'in_progress' AND created_at < now() - interval '2 minutes'))
          RETURNING key`,
        [held.tenantId, held.actorId, held.key, request.method, request.route,
          request.target, request.hash],
      );
      if ((taken.rowCount ?? 0) > 0) return { kind: 'reserved' } as const;

      const { rows } = await db.query(
        `SELECT status, request_hash, response_status, response_body
           FROM idempotency_keys
          WHERE tenant_id = $1 AND actor_id = $2 AND key = $3`,
        [held.tenantId, held.actorId, held.key],
      );
      const row = rows[0];
      if (!row || row.status === 'in_progress') return { kind: 'in_progress' } as const;
      return {
        kind: 'replay',
        hash: row.request_hash as string,
        status: row.response_status as number,
        body: row.response_body,
      } as const;
    });
  }

  async function complete(held: HeldKey, status: number, body: unknown): Promise<void> {
    await uow.run(held.tenantId, (tx) => clientOf(tx).query(
      `UPDATE idempotency_keys
          SET status = 'completed', response_status = $4, response_body = $5,
              completed_at = now()
        WHERE tenant_id = $1 AND actor_id = $2 AND key = $3 AND status = 'in_progress'`,
      [held.tenantId, held.actorId, held.key, status, JSON.stringify(body ?? null)],
    ));
  }

  async function release(held: HeldKey): Promise<void> {
    await uow.run(held.tenantId, (tx) => clientOf(tx).query(
      `DELETE FROM idempotency_keys
        WHERE tenant_id = $1 AND actor_id = $2 AND key = $3 AND status = 'in_progress'`,
      [held.tenantId, held.actorId, held.key],
    ));
  }
}

/**
 * The request as the key is bound to it: method, the concrete address, and the
 * body as sent. A client resending the same write sends the same bytes.
 */
function hashOf(req: FastifyRequest): string {
  return createHash('sha256')
    .update(`${req.method}\n${req.url}\n${JSON.stringify(req.body ?? null)}`)
    .digest('hex');
}

function parse(payload: unknown): unknown {
  if (typeof payload !== 'string') return payload ?? null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

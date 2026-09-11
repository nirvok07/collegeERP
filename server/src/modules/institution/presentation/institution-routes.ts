import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container.ts';
import { sendFailure, sendOk, sendResult } from '../../../infrastructure/http/server.ts';
import { requirePlatformActor } from '../../../infrastructure/http/guards.ts';
import { fail } from '../../../core/errors.ts';
import { provisionInstitution } from '../application/provision-institution.ts';

const provision = z.object({
  code: z.string().min(3).max(32),
  name: z.string().min(2).max(200),
  plan: z.string().optional(),
  seat_limit: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  admin: z.object({
    full_name: z.string().min(2).max(200),
    email: z.string().email(),
    phone: z.string().max(20).optional(),
  }),
});

export async function registerInstitutionRoutes(app: FastifyInstance, c: Container) {
  /**
   * W0. One request creates the institution and its first administrator, per
   * AD-20. The response carries the invitation token once; it is never stored
   * in plaintext and never retrievable again.
   */
  app.post('/institutions', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;

    const parsed = provision.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      return sendFailure(
        reply,
        fail('VALIDATION_FAILED', 'Check the highlighted fields.', { fieldErrors }),
      );
    }

    const result = await provisionInstitution(c.provisionInstitution, {
      code: parsed.data.code,
      name: parsed.data.name,
      plan: parsed.data.plan,
      seatLimit: parsed.data.seat_limit,
      timezone: parsed.data.timezone,
      admin: {
        fullName: parsed.data.admin.full_name,
        email: parsed.data.admin.email,
        phone: parsed.data.admin.phone ?? null,
      },
      actingPlatformAccountId: req.actor!.sub,
    });

    if (!result.ok) return sendFailure(reply, result.error);

    return sendOk(
      reply,
      {
        institution: {
          id: result.value.institution.id,
          code: result.value.institution.code,
          name: result.value.institution.name,
          status: result.value.institution.status,
          seat_limit: result.value.institution.seatLimit,
        },
        administrator: {
          person_id: result.value.adminPersonId,
          account_id: result.value.adminAccountId,
        },
        invitation: {
          token: result.value.invitationToken,
          expires_at: result.value.invitationExpiresAt.toISOString(),
          // Delivery is outside the provisioning transaction, so status is
          // reported rather than assumed.
          delivery: 'pending',
        },
      },
      201,
    );
  });

  app.get('/institutions', async (req, reply) => {
    if (!requirePlatformActor(req, reply)) return reply;
    const rows = await c.uow.run(null, (tx) => c.institutions.list(tx, 50));
    return sendOk(
      reply,
      rows.map((r) => ({
        id: r.id, code: r.code, name: r.name, status: r.status, seat_limit: r.seatLimit,
      })),
    );
  });
}

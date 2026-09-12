/**
 * Device registration for push delivery.
 *
 * M1 owns this because a device belongs to an account, and revoking it is part
 * of ending a session. The ERP decides who is notified and why; this records
 * only where a notification can be delivered.
 */
import { Err, Ok, type Result } from '../../../core/result.ts';
import { AppException, fail } from '../../../core/errors.ts';
import type { AuditWriter, Clock, IdGenerator, TokenIssuer } from '../../../shared/application/ports.ts';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.ts';
import type { DeviceRepository } from './ports.ts';

export interface ManageDevicesDeps {
  uow: UnitOfWork;
  devices: DeviceRepository;
  audit: AuditWriter;
  ids: IdGenerator;
  clock: Clock;
  tokens: TokenIssuer;
}

export interface RegisterDeviceInput {
  tenantId: string;
  personId: string;
  accountId: string;
  platform: 'android' | 'ios' | 'web';
  pushToken: string;
  appVersion?: string | null;
  deviceLabel?: string | null;
}

export async function registerDevice(
  deps: ManageDevicesDeps,
  input: RegisterDeviceInput,
): Promise<Result<{ deviceId: string }>> {
  if (!input.pushToken?.trim()) {
    return Err(fail('VALIDATION_FAILED', 'A push token is required.'));
  }

  const at = deps.clock.now();
  // Hashed before it ever reaches the repository. A push token is a capability:
  // anyone holding it can notify that device, so it is stored the way a
  // credential is, not the way an identifier is.
  const tokenHash = deps.tokens.hashOpaqueToken(input.pushToken.trim());

  try {
    return await deps.uow.run(input.tenantId, async (tx) => {
      const existing = await deps.devices.findActiveByTokenHash(tx, tokenHash);

      // The same handset re-registers on every launch. Re-pointing it at the
      // current account also matters on a shared device: the previous user must
      // stop receiving notifications the moment someone else signs in.
      if (existing) {
        await deps.devices.touch(tx, existing.id, {
          personId: input.personId,
          accountId: input.accountId,
          appVersion: input.appVersion ?? null,
          at,
        });
        return Ok({ deviceId: existing.id });
      }

      const id = deps.ids.next();
      await deps.devices.create(tx, {
        id,
        tenantId: input.tenantId,
        personId: input.personId,
        accountId: input.accountId,
        platform: input.platform,
        pushTokenHash: tokenHash,
        appVersion: input.appVersion ?? null,
        deviceLabel: input.deviceLabel ?? null,
      });

      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: input.tenantId,
        actorType: 'person',
        actorId: input.personId,
        action: 'device.registered',
        subjectType: 'device',
        subjectId: id,
        // The token itself is never audited, only that a device appeared.
        after: { platform: input.platform, appVersion: input.appVersion ?? null },
      }, tx);

      return Ok({ deviceId: id });
    });
  } catch (e) {
    if (e instanceof AppException) return Err(fail(e.code, e.message));
    throw e;
  }
}

/**
 * Called on sign-out. A shared device must not keep delivering the previous
 * user's notifications, which is the requirement in the security documentation.
 */
export async function revokeDevicesForAccount(
  deps: ManageDevicesDeps,
  input: { tenantId: string; accountId: string; personId: string; reason: string },
): Promise<number> {
  const at = deps.clock.now();
  return deps.uow.run(input.tenantId, async (tx) => {
    const revoked = await deps.devices.revokeForAccount(tx, input.accountId, input.reason, at);
    if (revoked > 0) {
      await deps.audit.record({
        correlationId: deps.ids.next(),
        tenantId: input.tenantId,
        actorType: 'person',
        actorId: input.personId,
        action: 'device.revoked',
        subjectType: 'user_account',
        subjectId: input.accountId,
        after: { devices: revoked },
        reason: input.reason,
      }, tx);
    }
    return revoked;
  });
}

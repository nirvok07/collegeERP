/**
 * AD-62 through a maintained library (otplib), never a hand-written algorithm.
 * The parameters come from TOTP_POLICY only.
 */
import { generateSecret, generateURI, verifySync } from 'otplib';
import { TOTP_POLICY, isTotpCode } from '../../modules/identity/domain/totp-policy.ts';

export interface TotpService {
  newSecret(): string;
  uri(secret: string, label: string): string;
  /** The matched time step lets the caller refuse a replayed code. */
  verify(secret: string, code: string, at: Date): { valid: boolean; timeStep: number | null };
}

export class OtplibTotp implements TotpService {
  newSecret(): string {
    return generateSecret();
  }

  uri(secret: string, label: string): string {
    return generateURI({
      issuer: TOTP_POLICY.issuer, label, secret,
      algorithm: TOTP_POLICY.algorithm, digits: TOTP_POLICY.digits, period: TOTP_POLICY.periodSeconds,
    });
  }

  verify(secret: string, code: string, at: Date): { valid: boolean; timeStep: number | null } {
    if (!isTotpCode(code)) return { valid: false, timeStep: null };
    try {
      const result = verifySync({
        secret, token: code,
        algorithm: TOTP_POLICY.algorithm, digits: TOTP_POLICY.digits, period: TOTP_POLICY.periodSeconds,
        epoch: Math.floor(at.getTime() / 1000),
        epochTolerance: TOTP_POLICY.toleranceSeconds,
      }) as { valid: boolean; timeStep?: number };
      return result.valid && typeof result.timeStep === 'number'
        ? { valid: true, timeStep: result.timeStep }
        : { valid: false, timeStep: null };
    } catch {
      return { valid: false, timeStep: null };
    }
  }
}

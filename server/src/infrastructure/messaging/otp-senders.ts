/**
 * OTP senders (AD-82). The real ones (an email provider; WhatsApp Business
 * falling back to an SMS gateway) are the go-live blocker; until then the
 * fixed code is used and nothing is sent.
 */
import type { OtpSender } from '../../modules/identity/application/otp-sign-in.ts';

/** Every code is the fixed one, so there is nothing to send. */
export class FixedCodeSender implements OtpSender {
  readonly ready = true;

  async send(): Promise<void> {}
}

/**
 * No provider and no fixed code. Asking for a code is refused for everyone
 * alike, so a missing provider never reveals who is registered.
 */
export class UnconfiguredSender implements OtpSender {
  readonly ready = false;

  async send(): Promise<void> {
    throw new Error('No OTP sender is configured.');
  }
}

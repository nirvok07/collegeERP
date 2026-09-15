/**
 * OTP senders (AD-82, OTP-7).
 *
 * Email goes over SMTP, so any provider works by configuration alone (Gmail
 * with an app password, Brevo, Amazon SES, Resend). WhatsApp and SMS have no
 * provider yet: those channels use the fixed code and nothing is sent, which
 * is the remaining go-live blocker.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { OtpChannel, OtpSender } from '../../modules/identity/application/otp-sign-in.ts';

/** Sends nothing on any channel: every code is the fixed one. */
export class NoMessageSender implements OtpSender {
  canSend(): boolean {
    return false;
  }

  async send(): Promise<void> {
    throw new Error('No OTP sender is configured.');
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  /** True for port 465 (TLS from the start); false for 587 (STARTTLS). */
  secure: boolean;
  user?: string;
  pass?: string;
  /** "College ERP <no-reply@example.com>" */
  from: string;
}

/**
 * Sign-in codes by email. The code is in the subject too, so it shows in a
 * phone's notification. A failure is reported to [onError] without the code
 * or the address, and the person simply asks again: the app is never told,
 * because that would reveal whether the email is registered.
 */
export class SmtpEmailSender implements OtpSender {
  constructor(
    private readonly settings: SmtpSettings,
    private readonly onError: (message: string) => void = () => {},
    transport?: Transporter,
  ) {
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.user ? { user: settings.user, pass: settings.pass ?? '' } : undefined,
      });
  }

  private readonly transport: Transporter;

  canSend(channel: OtpChannel): boolean {
    return channel === 'email';
  }

  async send(input: { channel: OtpChannel; destination: string; code: string }): Promise<void> {
    if (input.channel !== 'email') throw new Error('Only email is configured.');
    try {
      await this.transport.sendMail({
        from: this.settings.from,
        to: input.destination,
        subject: `${input.code} is your sign-in code`,
        text:
          `Your sign-in code is ${input.code}.\n\n` +
          'It works once, for 5 minutes. If you did not ask for it, ignore this email: ' +
          'nobody can sign in without the code.',
        html:
          `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.code}</p>` +
          '<p>It works once, for 5 minutes. If you did not ask for it, ignore this email: ' +
          'nobody can sign in without the code.</p>',
      });
    } catch (e) {
      this.onError(e instanceof Error ? e.message : 'unknown error');
      throw e;
    }
  }
}

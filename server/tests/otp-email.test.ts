/**
 * OTP-7: email sign-in codes are real; mobile codes keep the fixed code.
 *
 * What matters: an email identifier gets a random code, sent by email, and the
 * fixed code does not open it; a mobile identifier still uses the fixed code
 * and nothing is sent to it; the platform's email gets a real code too; and
 * the SMTP message carries the code where a person will see it.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import nodemailer from 'nodemailer';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount, setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';
import type { OtpChannel, OtpSender } from '../src/modules/identity/application/otp-sign-in.ts';
import { SmtpEmailSender } from '../src/infrastructure/messaging/otp-senders.ts';

/** Stands in for SMTP: email only, and remembers what it sent. */
class CapturingEmail implements OtpSender {
  sent: { channel: OtpChannel; destination: string; code: string }[] = [];
  canSend(channel: OtpChannel) {
    return channel === 'email';
  }
  async send(input: { channel: OtpChannel; destination: string; code: string }) {
    this.sent.push(input);
  }
  last(to: string) {
    return [...this.sent].reverse().find((s) => s.destination === to);
  }
}

let harness: TestApp;
const email = new CapturingEmail();
before(async () => {
  await setupDatabase();
  harness = await buildTestApp();
  harness.container.otpSignIn.sender = email;
});
after(async () => harness.close());
beforeEach(async () => {
  await resetData();
  email.sent = [];
});

const call = (method: 'GET' | 'POST', url: string, payload?: unknown, token?: string) =>
  harness.app.inject({
    method, url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  }) as Promise<LightMyRequestResponse>;

const ask = (college: string, identifier: string) =>
  call('POST', '/v1/auth/otp/request', { institution_code: college, identifier });
const verify = (college: string, challenge: string, code: string) =>
  call('POST', '/v1/auth/otp/verify', { institution_code: college, challenge_token: challenge, code });

async function college(code = 'mail-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const owner = (await signInPlatform(harness.app, platform.email, platform.password)).body.data.access_token as string;
  await provisionCollege(harness.app, owner, { code, adminEmail: `admin@${code}.edu` });
  return { code, adminEmail: `admin@${code}.edu` };
}

describe('OTP-7: codes by email are real', () => {
  it('an email gets a random code by email, and the fixed code does not open it', async () => {
    const c = await college();
    const challenge = (await ask(c.code, c.adminEmail)).json().data.challenge_token;
    const mail = email.last(c.adminEmail);
    assert.ok(mail, 'a code was emailed to that address');
    assert.equal(mail.channel, 'email');
    assert.match(mail.code, /^\d{6}$/);

    if (mail.code !== '123456') {
      assert.equal((await verify(c.code, challenge, '123456')).statusCode, 401, 'the fixed code is not a key to email sign-in');
    }
    assert.equal((await verify(c.code, challenge, mail.code)).statusCode, 200);
  });

  it('nothing is emailed for an address nobody has, and the answer is the same', async () => {
    const c = await college();
    const known = await ask(c.code, c.adminEmail);
    const unknown = await ask(c.code, `nobody@${c.code}.edu`);
    assert.equal(unknown.statusCode, known.statusCode);
    assert.equal(email.last(`nobody@${c.code}.edu`), undefined);
  });

  it('a mobile keeps the fixed code, and nothing is sent to it', async () => {
    const c = await college();
    const adminChallenge = (await ask(c.code, c.adminEmail)).json().data.challenge_token;
    const admin = (await verify(c.code, adminChallenge, email.last(c.adminEmail)!.code)).json().data.access_token;
    await call('POST', '/v1/people', {
      full_name: 'Dr. Meera Iyer', email: `meera@${c.code}.edu`, phone: '98765 43210', person_type: 'staff',
    }, admin);

    const before = email.sent.length;
    const challenge = (await ask(c.code, '9876543210')).json().data.challenge_token;
    assert.equal(email.sent.length, before, 'no email for a mobile sign-in');
    assert.equal((await verify(c.code, challenge, '123456')).statusCode, 200);
  });

  it('the platform\'s email gets a real code too', async () => {
    const owner = await seedPlatformAccount('owner@nirvok.com', 'unused-password-1', 'owner', { enrolled: false });
    const challenge = (await call('POST', '/v1/auth/platform/otp/request', { email: owner.email })).json().data.challenge_token;
    const mail = email.last(owner.email);
    assert.ok(mail);
    assert.equal((await call('POST', '/v1/auth/platform/otp/verify', { challenge_token: challenge, code: mail.code })).statusCode, 200);
  });
});

describe('the SMTP message', () => {
  it('is addressed to the person, from the college ERP, with the code in the subject and body', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (mail: nodemailer.SendMailOptions) => {
      const info = await original(mail);
      sent.push(String((info as { message: string }).message));
      return info;
    }) as typeof transport.sendMail;

    const sender = new SmtpEmailSender(
      { host: 'unused', port: 587, secure: false, from: 'College ERP <no-reply@college.test>' },
      () => {},
      transport,
    );
    assert.equal(sender.canSend('email'), true);
    assert.equal(sender.canSend('whatsapp'), false);
    await sender.send({ channel: 'email', destination: 'asha@college.test', code: '482913' });

    const message = JSON.parse(sent[0]!);
    assert.equal(message.to[0].address, 'asha@college.test');
    assert.equal(message.from.address, 'no-reply@college.test');
    assert.equal(message.subject, '482913 is your sign-in code');
    assert.match(message.text, /482913/);
  });
});

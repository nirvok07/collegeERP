import { loadConfig } from './config/config.ts';
import { buildContainer } from './container.ts';
import { buildServer } from './infrastructure/http/server.ts';

const config = loadConfig();
const container = buildContainer(config);
const app = await buildServer(container);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await container.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });

// AD-82 / OTP-7: said at every start until go-live, so it is never forgotten.
const emailCodesReal = Boolean(config.SMTP_HOST && config.SMTP_FROM);
if (emailCodesReal) {
  app.log.info(`Sign-in codes by email are sent through ${config.SMTP_HOST}.`);
}
if (config.OTP_FIXED_CODE) {
  app.log.warn(
    emailCodesReal
      ? 'AD-82: mobile sign-in codes (WhatsApp/SMS, not configured) are the fixed development code. '
          + "Anyone who knows a person's mobile number can sign in as them. "
          + 'Go-live blocker: configure WhatsApp/SMS and clear OTP_FIXED_CODE.'
      : 'AD-82: every sign-in code is the fixed development code and no message is sent. '
          + "Anyone who knows a person's email or mobile can sign in as them, the Super Admin included. "
          + 'Set SMTP_* for real email codes; WhatsApp/SMS and clearing OTP_FIXED_CODE are the go-live blocker.',
  );
}

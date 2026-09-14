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

// AD-82: said at every start until go-live, so it is never forgotten.
if (config.OTP_FIXED_CODE) {
  app.log.warn(
    'AD-82: every sign-in code is the fixed development code and no message is sent. '
      + "Anyone who knows a person's email or mobile can sign in as them, the Super Admin included. "
      + 'Go-live blocker: configure the email/WhatsApp/SMS senders and clear OTP_FIXED_CODE.',
  );
}

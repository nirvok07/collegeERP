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

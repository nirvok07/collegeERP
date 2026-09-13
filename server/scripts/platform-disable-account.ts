/**
 * OPS-2: disables a platform account. Development and app testing only.
 *
 *   npm run platform:disable-account -- --email old@example.com \
 *     --reason "Replaced by the real Owner account" --operator "<your name>" \
 *     --confirm "DISABLE old@example.com"
 *
 * Never the last usable Owner. Audited as the system with the operator named.
 */
import { loadConfig } from '../src/config/config.ts';
import { buildContainer } from '../src/container.ts';
import {
  operatorDisablePlatformAccount, parseDisableArgs,
} from '../src/modules/identity/application/platform-operator.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refused: development tooling only. In production an Owner disables accounts in the console.');
  process.exit(2);
}
const args = parseDisableArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(2);
}
const container = buildContainer(config);
try {
  const result = await operatorDisablePlatformAccount(container.platformMfa, args);
  if (!result.ok) {
    console.error(`Refused: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`${args.email} is disabled and can no longer sign in. Audited.`);
  }
} finally {
  await container.close();
}

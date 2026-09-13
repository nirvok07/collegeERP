/**
 * OPS-2: creates an active platform Owner. Development and app testing only.
 *
 *   PLATFORM_PASSWORD='<password>' npm run platform:create-owner -- \
 *     --email owner@example.com --name "Full Name" --reason "Real Owner account for development" \
 *     --operator "<your name>" --confirm "CREATE OWNER owner@example.com"
 *
 * The authenticator is set up at the account's first sign-in (AD-62). Never
 * prints a secret. Audited as the system with the operator named.
 */
import { loadConfig } from '../src/config/config.ts';
import { buildContainer } from '../src/container.ts';
import {
  operatorCreatePlatformOwner, parseCreateOwnerArgs,
} from '../src/modules/identity/application/platform-operator.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refused: development tooling only. In production an Owner creates accounts in the console.');
  process.exit(2);
}
const args = parseCreateOwnerArgs(process.argv.slice(2), process.env.PLATFORM_PASSWORD);
if ('error' in args) {
  console.error(args.error);
  process.exit(2);
}
const container = buildContainer(config);
try {
  const result = await operatorCreatePlatformOwner(container.platformMfa, args);
  if (!result.ok) {
    console.error(`Refused: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Owner ${args.email} created. They set up an authenticator at first sign-in. Audited.`);
  }
} finally {
  await container.close();
}

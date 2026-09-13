/**
 * OPS-1: sets a platform account's password. Development and app testing only.
 *
 *   PLATFORM_PASSWORD='<new password>' npm run platform:set-password -- \
 *     --email owner@example.com --reason "Known login for app testing" \
 *     --operator "<your name>" --confirm "SET PASSWORD owner@example.com"
 *
 * It never prints a secret and never touches the authenticator. Audited.
 */
import { loadConfig } from '../src/config/config.ts';
import { buildContainer } from '../src/container.ts';
import {
  operatorSetPlatformPassword, parseOperatorPasswordArgs,
} from '../src/modules/identity/application/platform-operator.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refused: development tooling only. In production an Owner reissues the invitation in the console.');
  process.exit(2);
}
const args = parseOperatorPasswordArgs(process.argv.slice(2), process.env.PLATFORM_PASSWORD);
if ('error' in args) {
  console.error(args.error);
  process.exit(2);
}
const container = buildContainer(config);
try {
  const result = await operatorSetPlatformPassword(container.platformMfa, args);
  if (!result.ok) {
    console.error(`Refused: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Password set for ${args.email}. Their authenticator is unchanged. Audited.`);
  }
} finally {
  await container.close();
}

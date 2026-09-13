/**
 * AD-63 break-glass: clears the authenticator of the sole Owner who lost it,
 * so they enrol a new one at their next sign-in. Operator use only.
 *
 *   npm run platform:break-glass -- --email owner@example.com \
 *     --reason "Phone lost, identity confirmed by <how>" --operator "<your name>" \
 *     --confirm "RESET owner@example.com"
 *
 * It never prints a secret and never disables MFA. It refuses whenever another
 * enrolled Owner exists, because that Owner can reset it in the console.
 */
import { loadConfig } from '../src/config/config.ts';
import { buildContainer } from '../src/container.ts';
import { breakGlassResetPlatformMfa, parseBreakGlassArgs } from '../src/modules/identity/application/platform-mfa.ts';

const args = parseBreakGlassArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(2);
}
const container = buildContainer(loadConfig());
try {
  const result = await breakGlassResetPlatformMfa(container.platformMfa, args);
  if (!result.ok) {
    console.error(`Refused: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Authenticator cleared for ${args.email}. They enrol a new one at their next sign-in. Audited.`);
  }
} finally {
  await container.close();
}

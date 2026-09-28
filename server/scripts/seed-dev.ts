/**
 * Canonical development seed entry point.
 *
 * The existing college-tree builder owns the API-shaped fixture and is already
 * resumable/idempotent. Keep this stable command name for runbooks and CI;
 * importing it executes the builder once and preserves its owner-only output
 * file and production refusal.
 */
await import('./seed-college-tree.ts');

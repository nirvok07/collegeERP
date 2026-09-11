import { describe, expect, it } from 'vitest';
import { parseEnvelope } from './api.ts';

/**
 * The envelope is the contract between client and server (docs/05-api-contract.md
 * §5.2). These pin it down, including the rule that server error copy is shown
 * verbatim and technical detail never reaches the user.
 */
describe('response envelope', () => {
  it('unwraps data on success', () => {
    const result = parseEnvelope<{ id: string }>({ data: { id: 'x' }, meta: {} }, true);
    expect(result).toEqual({ ok: true, value: { id: 'x' } });
  });

  it('uses the server message verbatim rather than inventing copy', () => {
    const result = parseEnvelope({ error: { code: 'CONFLICT', message: 'That institution code is already taken.' } }, false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('That institution code is already taken.');
    expect(result.error.code).toBe('CONFLICT');
  });

  it('carries field errors through so forms can attach them to their fields', () => {
    const result = parseEnvelope({
      error: { code: 'VALIDATION_FAILED', message: 'Check the highlighted fields.', field_errors: { code: 'Invalid' } },
    }, false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.fieldErrors).toEqual({ code: 'Invalid' });
  });

  it('treats an error body with a 200 status as a failure', () => {
    const result = parseEnvelope({ error: { code: 'FORBIDDEN', message: 'No.' } }, true);
    expect(result.ok).toBe(false);
  });

  it('falls back to safe copy when the body is not the expected shape', () => {
    const result = parseEnvelope({ unexpected: true }, true);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.message).toMatch(/something went wrong/i);
  });

  it('never surfaces a raw status code as user-facing text', () => {
    const result = parseEnvelope({}, false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.message).not.toMatch(/\d{3}/);
  });
});

/**
 * The platform's second factor as the console shows it (SA-3b). Pure.
 * The server decides validity; this only tidies what a person types.
 */

/** People paste codes with spaces; only the six digits are sent. */
export function normaliseCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

export const isCompleteCode = (code: string) => /^\d{6}$/.test(code);

/** The manual key in groups of four, the way authenticator apps show it. */
export function formatManualKey(key: string): string {
  return key.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? '';
}

/** A spent or expired step sends the person back to the password. */
export const isExpiredStep = (message: string) => /expired|start again/i.test(message);

export function invitationTokenFrom(search: string): string | null {
  const token = new URLSearchParams(search).get('token');
  return token && token.length >= 10 ? token : null;
}

/**
 * AD-6: client-generated UUIDs. Identity exists before any server sees a record,
 * so references between records created offline still hold.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_PATTERN.test(v);

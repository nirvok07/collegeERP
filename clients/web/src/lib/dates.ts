/**
 * Calendar dates, handled as 'YYYY-MM-DD' strings in UTC.
 *
 * A date is not an instant. A local `Date` shifts the day for every timezone
 * east of UTC and again across a daylight-saving boundary, which is how a
 * timetable ends up wrong by one day in some months and right in others. The
 * server sends and accepts these strings for the same reason.
 *
 * Shared, because two features now ask the same questions of a calendar.
 */
const DAY_MS = 86_400_000;

export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

export const today = (): string => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO-8601 day numbering: 1 is Monday, 7 is Sunday. */
export function isoDayOfWeek(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Weeks start on Monday, which is how a college timetable is drawn. */
export function startOfWeek(date: string): string {
  return addDays(date, -(isoDayOfWeek(date) - 1));
}

export function dayLabel(date: string): string {
  return `${DAY_NAMES[isoDayOfWeek(date) - 1]}, ${new Date(`${date}T00:00:00Z`)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return dayLabel(from);
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(from)} to ${fmt(to)}`;
}

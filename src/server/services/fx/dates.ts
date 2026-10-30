const DAY_MS = 24 * 60 * 60 * 1000;
/** Calendar days are Swiss (the user's) days. */
const TIME_ZONE = 'Europe/Zurich';

/** Today's date in Switzerland, as `YYYY-MM-DD`. */
export function swissToday(now: Date = new Date()): string {
  // en-CA renders dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The ISO date `days` calendar days after (or before, when negative) `iso`. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

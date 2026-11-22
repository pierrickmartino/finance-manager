/**
 * Calendar-day arithmetic on ISO dates (`YYYY-MM-DD`): pure, so the browser, `src/lib` and the
 * server share it. Calendar days are Swiss (the user's) days.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = 'Europe/Zurich';
const MONTHS_PER_YEAR = 12;

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

/** An ISO date's parts: its year, its month (1 to 12) and its day of the month. */
export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function dateParts(iso: string): DateParts {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8)),
  };
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** A date from its parts, as `YYYY-MM-DD`. */
export const isoDate = ({ year, month, day }: DateParts): string =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** A month's place in a count of months from year 0: consecutive months differ by one. */
export function monthIndex(iso: string): number {
  const { year, month } = dateParts(iso);
  return year * MONTHS_PER_YEAR + month - 1;
}

/** The first day of the month at `index` (see `monthIndex`). */
export function monthStart(index: number): string {
  return isoDate({
    year: Math.floor(index / MONTHS_PER_YEAR),
    month: (index % MONTHS_PER_YEAR) + 1,
    day: 1,
  });
}

/** Days in the month at `index` (see `monthIndex`). */
function daysInMonth(index: number): number {
  return daysBetween(monthStart(index), monthStart(index + 1));
}

/** A date `years` years earlier, its day capped at its month's end (29 February → 28th). */
export function yearsEarlier(iso: string, years: number): string {
  const index = monthIndex(iso) - years * MONTHS_PER_YEAR;
  const start = dateParts(monthStart(index));
  return isoDate({ ...start, day: Math.min(dateParts(iso).day, daysInMonth(index)) });
}

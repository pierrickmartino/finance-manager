import type { PeriodView } from '@/lib/analytics/period-view';
import { addDays, daysBetween } from '../fx/dates';
import { periodOf, type DateSpan } from '../reporting/periods';

/**
 * The Comparison span (GLOSSARY): the stretch of the previous period, of the same length as the
 * current period to date, that a to-date figure is compared with.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const pad = (value: number) => String(value).padStart(2, '0');
const isoDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${pad(month + 1)}-${pad(day)}`;

/** Days in a month (0-based), of a year. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The `day`th of a month (0-based, may run past December or before January), capped at its end. */
function cappedDay(year: number, month: number, day: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const [y, m] = [first.getUTCFullYear(), first.getUTCMonth()];
  return isoDate(y, m, Math.min(day, daysIn(y, m)));
}

/** The Comparison span of the current period of a Period view on `today`. */
export function comparisonSpan(view: PeriodView, today: string): DateSpan {
  const [year, month, day] = [
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  ];
  if (view === 'quarter') {
    const current = periodOf(today, 'quarter');
    const previous = periodOf(addDays(current.from, -1), 'quarter');
    const to = addDays(previous.from, daysBetween(current.from, today));
    return { from: previous.from, to: to < previous.to ? to : previous.to };
  }
  if (view === 'year') {
    // The same dates last year; 29 February falls back to 28 February.
    return { from: isoDate(year - 1, 0, 1), to: cappedDay(year - 1, month, day) };
  }
  return { from: cappedDay(year, month - 1, 1), to: cappedDay(year, month - 1, day) };
}

/** A span's dates as the change line says them: "vs 1–22 Oct", the year only when not today's. */
export function comparisonLabel(span: DateSpan, today: string): string {
  const part = (iso: string) => ({
    year: iso.slice(0, 4),
    month: MONTH_NAMES[Number(iso.slice(5, 7)) - 1]!,
    day: String(Number(iso.slice(8, 10))),
  });
  const [from, to] = [part(span.from), part(span.to)];
  const year = to.year === today.slice(0, 4) ? '' : ` ${to.year}`;
  if (span.from === span.to) return `vs ${to.day} ${to.month}${year}`;
  if (from.month === to.month && from.year === to.year) {
    return `vs ${from.day}–${to.day} ${to.month}${year}`;
  }
  const fromYear = from.year === to.year ? '' : ` ${from.year}`;
  return `vs ${from.day} ${from.month}${fromYear} – ${to.day} ${to.month}${year}`;
}

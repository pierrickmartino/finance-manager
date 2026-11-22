import { spanStart, type Span, type SpanPreset } from '@/lib/analytics/span';
import { MONTH_NAMES } from '@/lib/format';
import { addDays, daysBetween } from '../fx/dates';
import { periodOf, type DateSpan } from '../reporting/periods';

/**
 * The Comparison span (GLOSSARY, ADR-0016): the stretch a Span's Key figures are compared with.
 */

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

/** The calendar years a preset to date of years reads: this one, and the whole ones before. */
const YEARS_READ: Partial<Record<SpanPreset, number>> = {
  'year-to-date': 1,
  'this-year-and-last-1': 2,
  'this-year-and-last-2': 3,
  'this-year-and-last-3': 4,
  'this-year-and-last-4': 5,
};

/** The same stretch of the previous calendar quarter: as many days in, capped at its end. */
function previousQuarterToDate(today: string): DateSpan {
  const current = periodOf(today, 'quarter');
  const previous = periodOf(addDays(current.from, -1), 'quarter');
  const to = addDays(previous.from, daysBetween(current.from, today));
  return { from: previous.from, to: to < previous.to ? to : previous.to };
}

/** A date `years` years earlier: 29 February falls back to 28 February. */
function yearsEarlier(iso: string, years: number): string {
  const [year, month, day] = [
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)),
    Number(iso.slice(8)),
  ];
  return cappedDay(year - years, month - 1, day);
}

/** The stretch of as many days just before a span's start. */
function daysBefore({ from, to }: DateSpan): DateSpan {
  const days = daysBetween(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/**
 * The Comparison span of a Span read over `dates` (its start, then today). A Span to date of a
 * calendar quarter, or of calendar years, is compared with the same stretch of the previous
 * quarter, or of as many years before; any other Span, or one read from a later start than its
 * preset gives, with as many days just before it.
 */
export function comparisonSpan(span: Span, dates: DateSpan): DateSpan {
  if (span.kind === 'preset' && spanStart(span, dates.to) === dates.from) {
    if (span.preset === 'quarter-to-date') return previousQuarterToDate(dates.to);
    const years = YEARS_READ[span.preset];
    if (years !== undefined) {
      return { from: yearsEarlier(dates.from, years), to: yearsEarlier(dates.to, years) };
    }
  }
  return daysBefore(dates);
}

/** A span's dates as the change line says them: "vs 1–22 Oct", the year only when not today's. */
export function comparisonLabel(span: DateSpan, today: string): string {
  const dateParts = (iso: string) => ({
    year: iso.slice(0, 4),
    month: MONTH_NAMES[Number(iso.slice(5, 7)) - 1]!,
    day: String(Number(iso.slice(8, 10))),
  });
  const [from, to] = [dateParts(span.from), dateParts(span.to)];
  const year = to.year === today.slice(0, 4) ? '' : ` ${to.year}`;
  if (span.from === span.to) return `vs ${to.day} ${to.month}${year}`;
  if (from.month === to.month && from.year === to.year) {
    return `vs ${from.day}–${to.day} ${to.month}${year}`;
  }
  const fromYear = from.year === to.year ? '' : ` ${from.year}`;
  return `vs ${from.day} ${from.month}${fromYear} – ${to.day} ${to.month}${year}`;
}

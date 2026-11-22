import { presetComparison, spanStart, type Span } from '@/lib/analytics/span';
import { addDays, dateParts, daysBetween, yearsEarlier } from '@/lib/dates';
import { MONTH_NAMES } from '@/lib/format';
import { periodOf, type DateSpan } from '../reporting/periods';

/**
 * The Comparison span (GLOSSARY, ADR-0016): the stretch a Span's Key figures are compared with.
 */

/** The same stretch of the previous calendar quarter: as many days in, capped at its end. */
function previousQuarterToDate(today: string): DateSpan {
  const current = periodOf(today, 'quarter');
  const previous = periodOf(addDays(current.from, -1), 'quarter');
  const to = addDays(previous.from, daysBetween(current.from, today));
  return { from: previous.from, to: to < previous.to ? to : previous.to };
}

/** The stretch of as many days just before a span's start. */
function daysBefore({ from, to }: DateSpan): DateSpan {
  const days = daysBetween(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/**
 * The Comparison span of a Span read over `dates` (its start, then today), by its preset's
 * comparison rule (src/lib/analytics/span.ts): a Span to date of a calendar quarter, or of
 * calendar years, is compared with the same stretch of the previous quarter, or of as many years
 * before; any other Span, or one read from a later start than its preset gives (cut to the
 * data), with as many days just before it.
 */
export function comparisonSpan(span: Span, dates: DateSpan): DateSpan {
  if (span.kind !== 'preset' || spanStart(span, dates.to) !== dates.from) return daysBefore(dates);
  const comparison = presetComparison(span.preset);
  switch (comparison.kind) {
    case 'previousQuarterToDate':
      return previousQuarterToDate(dates.to);
    case 'yearsEarlier': {
      const { years } = comparison;
      return { from: yearsEarlier(dates.from, years), to: yearsEarlier(dates.to, years) };
    }
    case 'daysBefore':
      return daysBefore(dates);
  }
}

/** A day's parts as the change line says them: "22", "Oct", 2026. */
function inWords(iso: string) {
  const { year, month, day } = dateParts(iso);
  return { year, month: MONTH_NAMES[month - 1]!, day };
}

/** A span's dates as the change line says them: "vs 1–22 Oct", the year only when not today's. */
export function comparisonLabel(span: DateSpan, today: string): string {
  const [from, to] = [inWords(span.from), inWords(span.to)];
  const year = to.year === dateParts(today).year ? '' : ` ${to.year}`;
  if (span.from === span.to) return `vs ${to.day} ${to.month}${year}`;
  if (from.month === to.month && from.year === to.year) {
    return `vs ${from.day}–${to.day} ${to.month}${year}`;
  }
  const fromYear = from.year === to.year ? '' : ` ${from.year}`;
  return `vs ${from.day} ${from.month}${fromYear} – ${to.day} ${to.month}${year}`;
}

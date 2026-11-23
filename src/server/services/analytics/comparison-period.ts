import { presetComparison, periodStart, type Period } from '@/lib/analytics/period';
import { addDays, dateParts, daysBetween, yearsEarlier } from '@/lib/dates';
import { MONTH_NAMES } from '@/lib/format';
import { periodOf, type DateSpan } from '../reporting/periods';

/**
 * The Comparison period (GLOSSARY, ADR-0016): the stretch a Period's Key figures are compared with.
 */

/** The same stretch of the previous calendar quarter: as many days in, capped at its end. */
function previousQuarterToDate(today: string): DateSpan {
  const current = periodOf(today, 'quarter');
  const previous = periodOf(addDays(current.from, -1), 'quarter');
  const to = addDays(previous.from, daysBetween(current.from, today));
  return { from: previous.from, to: to < previous.to ? to : previous.to };
}

/** The stretch of as many days just before a period's start. */
function daysBefore({ from, to }: DateSpan): DateSpan {
  const days = daysBetween(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/**
 * The Comparison period of a Period read over `dates` (its start, then today), by its preset's
 * comparison rule (src/lib/analytics/period.ts): a Period to date of a calendar quarter, or of
 * calendar years, is compared with the same stretch of the previous quarter, or of as many years
 * before; any other Period, or one read from a later start than its preset gives (cut to the
 * data), with as many days just before it.
 */
export function comparisonPeriod(period: Period, dates: DateSpan): DateSpan {
  if (period.kind !== 'preset' || periodStart(period, dates.to) !== dates.from)
    return daysBefore(dates);
  const comparison = presetComparison(period.preset);
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

/** A period's dates as the change line says them: "vs 1–22 Oct", the year only when not today's. */
export function comparisonLabel(period: DateSpan, today: string): string {
  const [from, to] = [inWords(period.from), inWords(period.to)];
  const year = to.year === dateParts(today).year ? '' : ` ${to.year}`;
  if (period.from === period.to) return `vs ${to.day} ${to.month}${year}`;
  if (from.month === to.month && from.year === to.year) {
    return `vs ${from.day}–${to.day} ${to.month}${year}`;
  }
  const fromYear = from.year === to.year ? '' : ` ${from.year}`;
  return `vs ${from.day} ${from.month}${fromYear} – ${to.day} ${to.month}${year}`;
}

import { formatPeriod } from '@/lib/format';
import { readStart, spanGrain, type Span } from '@/lib/analytics/span';
import { periodSpan, periodsIn } from '../reporting/periods';
import type { DateRange, TimeAxis } from '../reporting/query';

/** One period Analytics is read over, oldest first. */
export interface AnalyticsPeriod {
  /** The reporting period key: `2025-03`, `2025-Q1` or `2025`. */
  key: string;
  label: string;
  /** The last period, still running: shown "to date" and left out of averages. */
  isToDate: boolean;
  /** The first period, cut short by the start date: set apart as the to-date one is. */
  isPartial: boolean;
}

/**
 * What every section of Analytics reads: the Span (GLOSSARY, ADR-0016) resolved on today, from
 * its first day to today, split into periods of its grain. `loadAnalytics` resolves it once, so a
 * section never reads the Span itself.
 */
export interface AnalyticsReading {
  /** How it was chosen: what Analytics' URL and a Drill-down's way back carry. */
  span: Span;
  /** The first day read. */
  from: string;
  /** The last day read: always today. */
  to: string;
  grain: TimeAxis;
  /** The reporting date range the sections query: `from` to today, fixed. */
  range: DateRange;
  periods: AnalyticsPeriod[];
}

/** Whether a period is set apart from complete ones: partial, or to date. */
export const isIncomplete = (period: AnalyticsPeriod): boolean =>
  period.isToDate || period.isPartial;

/**
 * A Span's reading on `today`, given the first Transaction's date (`dataStart`, null for none):
 * read from its start cut to the data (`readStart`), a custom Span's date moved with it while a
 * preset keeps its name; its periods at the grain its length gives, the first cut at that start
 * (partial when it is not the period's first day), the last to date.
 */
export function readingOf(
  span: Span,
  today: string,
  dataStart: string | null = null,
): AnalyticsReading {
  const from = readStart(span, today, dataStart);
  const grain = spanGrain(from, today);
  const keys = periodsIn({ from, to: today }, grain);
  return {
    span: span.kind === 'custom' ? { kind: 'custom', from } : span,
    from,
    to: today,
    grain,
    range: { kind: 'fixed', from, to: today },
    periods: keys.map((key, index) => ({
      key,
      label: formatPeriod(key),
      isToDate: index === keys.length - 1,
      isPartial: index === 0 && periodSpan(key, grain).from < from,
    })),
  };
}

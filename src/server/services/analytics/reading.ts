import { formatPeriod } from '@/lib/format';
import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import { periodsIn, resolveRange } from '../reporting/periods';
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
 * What every section of Analytics reads: the stretch of days from `from` to today, split into
 * periods of its grain. `loadAnalytics` resolves it once, so a section never reads the Period
 * view (or, in its place, the Span) itself.
 */
export interface AnalyticsReading {
  /** How it was chosen: what Analytics' URL and a Drill-down's way back carry. */
  view: PeriodView;
  /** The first day read. */
  from: string;
  /** The last day read: always today. */
  to: string;
  grain: TimeAxis;
  /** The reporting date range the sections query, `from` to today. */
  range: DateRange;
  periods: AnalyticsPeriod[];
}

/** Whether a period is set apart from complete ones: partial, or to date. */
export const isIncomplete = (period: AnalyticsPeriod): boolean =>
  period.isToDate || period.isPartial;

/** A Period view's reading on `today`: its Period window, the current period to date. */
export function readingOf(view: PeriodView, today: string): AnalyticsReading {
  const range = windowRange(view);
  const { range: span } = resolveRange(range, today);
  const keys = periodsIn(span, view);
  return {
    view,
    from: span.from,
    to: span.to,
    grain: view,
    range,
    periods: keys.map((key, index) => ({
      key,
      label: formatPeriod(key),
      isToDate: index === keys.length - 1,
      isPartial: false,
    })),
  };
}

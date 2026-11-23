import { formatPeriod } from '@/lib/format';
import {
  NO_PINS,
  presetPeriod,
  readStart,
  periodGrain,
  type AnalyticsPage,
  type Period,
  type PeriodPreset,
} from '@/lib/analytics/period';
import { periodSpan, periodsIn } from '../reporting/periods';
import type { DateRange, TimeAxis } from '../reporting/query';

/** One interval Analytics is read over, oldest first. */
export interface AnalyticsInterval {
  /** The reporting interval key: `2025-03`, `2025-Q1` or `2025`. */
  key: string;
  label: string;
  /** The last interval, still running: shown "to date" and left out of averages. */
  isToDate: boolean;
  /** The first interval, cut short by the start date: set apart as the to-date one is. */
  isPartial: boolean;
}

/**
 * What every section of Analytics reads: the Period (GLOSSARY, ADR-0016) resolved on today, from
 * its first day to today, split into intervals of its grain. `loadAnalytics` resolves it once, so a
 * section never reads the Period itself.
 */
export interface AnalyticsReading {
  /** How it was chosen: the page's Period, or a pinned Card's own (GLOSSARY: Card Period). */
  period: Period;
  /**
   * The page it is read on: the page's Period and every Card's pin, what Analytics' URL and a
   * Drill-down's way back carry, whichever Period the reading itself is over.
   */
  page: AnalyticsPage;
  /** The first day read. */
  from: string;
  /** The last day read: always today. */
  to: string;
  grain: TimeAxis;
  /** The reporting date range the sections query: `from` to today, fixed. */
  range: DateRange;
  intervals: AnalyticsInterval[];
}

/** Whether an interval is set apart from complete ones: partial, or to date. */
export const isIncomplete = (interval: AnalyticsInterval): boolean =>
  interval.isToDate || interval.isPartial;

/**
 * A Period's reading on `today`, given the first Transaction's date (`dataStart`, null for none):
 * read from its start cut to the data (`readStart`), a custom Period's date moved with it while a
 * preset keeps its name; its intervals at the grain its length gives, the first cut at that start
 * (partial when it is not the interval's first day), the last to date.
 */
export function readingOf(
  period: Period,
  today: string,
  dataStart: string | null = null,
): AnalyticsReading {
  const from = readStart(period, today, dataStart);
  const grain = periodGrain(from, today);
  const keys = periodsIn({ from, to: today }, grain);
  const effective: Period = period.kind === 'custom' ? { kind: 'custom', from } : period;
  return {
    period: effective,
    page: { period: effective, cardPeriods: NO_PINS },
    from,
    to: today,
    grain,
    range: { kind: 'fixed', from, to: today },
    intervals: keys.map((key, index) => ({
      key,
      label: formatPeriod(key),
      isToDate: index === keys.length - 1,
      isPartial: index === 0 && periodSpan(key, grain).from < from,
    })),
  };
}

/**
 * A pinned Card's reading (GLOSSARY: Card Period): its preset resolved on the page reading's today
 * and the same first Transaction (`dataStart`), so it is cut to the data like any Period, while
 * its Drill-downs still lead back to the page it sits on.
 */
export function cardReading(
  page: AnalyticsReading,
  preset: PeriodPreset,
  dataStart: string | null = null,
): AnalyticsReading {
  return { ...readingOf(presetPeriod(preset), page.to, dataStart), page: page.page };
}

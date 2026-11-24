import { periodDates } from '@/lib/analytics/period';
import type { ServiceContext } from '../context';
import { addDays } from '../fx/dates';
import {
  netWorthPointDate,
  runNetWorthPoints,
  type NetWorthPoint,
  type ReportTable,
} from '../reporting';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Net worth trend (GLOSSARY: Net worth, ADR-0014), which the Key figures' Net worth
 * tile draws as its sparkline: every Account's computed balance, loans counting against it,
 * converted to CHF at each date's FX rate (ADR-0002), at the Period's start, each interval end
 * and today (ADR-0016).
 */

/**
 * The trend's points: the Period's start, then each interval's end, the last today. The start is
 * labelled with the Period's first day but reads the end of the day before it, so the change
 * counts every day of the Period. A Period of a single interval still has two.
 */
function trendPoints({ from, to: today, grain, intervals }: AnalyticsReading): NetWorthPoint[] {
  const start = addDays(from, -1);
  return [
    { key: start, label: periodDates({ from, to: from }), date: start, isPartial: false },
    ...intervals.map((interval) => ({
      key: interval.key,
      label: interval.label,
      date: netWorthPointDate(interval.key, grain, today),
      isPartial: interval.isToDate,
    })),
  ];
}

/** Net worth over the reading: at its start, at the end of each interval, the last today. */
export function netWorthTrend(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<ReportTable> {
  return runNetWorthPoints(ctx, reading.grain, trendPoints(reading));
}

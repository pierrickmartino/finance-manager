import { accountsHref } from '@/lib/accounts/links';
import { periodDates } from '@/lib/analytics/period';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { toChartSource } from '@/lib/reporting/pivot-source';
import type { ServiceContext } from '../context';
import { addDays } from '../fx/dates';
import {
  netWorthPointDate,
  runNetWorthPoints,
  type NetWorthPoint,
  type ReportTable,
} from '../reporting';
import type { AnalyticsCard, SectionStatus, SharedSections } from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Net worth (GLOSSARY: Net worth, ADR-0014), drawn as the Dashboard's Net worth card:
 * every Account's computed balance, loans counting against it, converted to CHF at each date's
 * FX rate (ADR-0002); beside it a trend over the Period (ADR-0016), from its start through each
 * interval end to today, and its change since the start; under it what came in, went out and the
 * Profit over the Period.
 */
export interface AnalyticsNetWorth extends SectionStatus {
  /** What the card reads as it reads a Dashboard's Widgets: today's balances, and the flows. */
  cards: AnalyticsCard[];
  /**
   * Net worth at the Period's start, each interval end of the Period, then today, each opening the
   * Accounts then.
   */
  trend: ChartSource;
  /** Net worth today less Net worth at the Period's start; null with no point to read. */
  change: NetWorthChange | null;
}

/** How Net worth moved over the Period: today against its start. */
export interface NetWorthChange {
  /** The start point's label: the Period's first day, at whose start it stands. */
  since: string;
  change: number;
  /** The Accounts as of the start. */
  href: string;
}

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

/**
 * Net worth over the reading, from its trend (`netWorthTrend`), the Account balances and the
 * Period's income and expense (the Account balances and Spending Insights sections). Its
 * `unconvertedCount` counts Accounts left out of some point for want of an FX rate.
 */
export async function netWorth(
  reading: AnalyticsReading,
  sections: SharedSections,
): Promise<AnalyticsNetWorth> {
  const [report, balances, flow] = await Promise.all([
    sections.trend,
    sections.balances,
    sections.flow,
  ]);
  const dates = new Map(trendPoints(reading).map((point) => [point.key, point.date]));
  const hrefOf = (key: unknown) =>
    accountsHref({ date: (typeof key === 'string' && dates.get(key)) || reading.to });
  const trend = toChartSource(report, { hrefOf: (cell) => hrefOf(cell.row), drill: null });
  return {
    cards: [balances, flow],
    trend,
    change: changeSinceStart(report, hrefOf),
    isEmpty: balances.isEmpty,
    unconvertedCount: report.unconvertedCount,
  };
}

/** The trend's last point less its first, the Period's start. */
function changeSinceStart(
  report: ReportTable,
  hrefOf: (key: unknown) => string,
): NetWorthChange | null {
  const start = report.rows[0];
  if (!start || report.rows.length < 2) return null;
  const first = report.rowTotals[0] ?? 0;
  const latest = report.rowTotals.at(-1) ?? 0;
  return { since: start.label, change: latest - first, href: hrefOf(start.key) };
}

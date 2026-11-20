import { WINDOW_LENGTHS, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { swissToday } from '../fx/dates';
import { netWorthPointDate, runNetWorthTrend } from '../reporting';
import type { AnalyticsPeriod } from './window';

/** One point of the Net worth trend: a period's end, or today for the current period. */
export interface NetWorthPoint extends AnalyticsPeriod {
  /** The day the point stands for. */
  date: string;
  /** Net worth in CHF minor units on `date`. */
  value: number;
}

/** The period end a change is measured from. */
export interface NetWorthSince {
  key: string;
  label: string;
  date: string;
}

/**
 * Analytics' Net worth (GLOSSARY: Net worth, ADR-0014): every Account's computed balance, loans
 * counting against it, converted to CHF at each date's FX rate (ADR-0002).
 */
export interface AnalyticsNetWorth {
  /** Net worth today; null without an Account. */
  today: { date: string; value: number } | null;
  /** One point per period end of the Period window, then today, oldest first. */
  points: NetWorthPoint[];
  /** Today's Net worth against the end of the previous period; null without both. */
  change: { since: NetWorthSince; value: number } | null;
  /** Accounts left out of some point for want of an FX rate. */
  unconvertedCount: number;
}

/** Net worth at a Period view: the Net worth trend over the Period window. */
export async function netWorth(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<AnalyticsNetWorth> {
  const today = swissToday();
  const report = await runNetWorthTrend(ctx, { unit: view, count: WINDOW_LENGTHS[view] - 1 });
  const byKey = new Map(report.rows.map((row, r) => [row.key, report.rowTotals[r] ?? 0]));
  // No Account: the trend has no rows, and there is nothing to show.
  const points: NetWorthPoint[] = window
    .filter((period) => byKey.has(period.key))
    .map((period) => ({
      ...period,
      date: netWorthPointDate(period.key, view, today),
      value: byKey.get(period.key)!,
    }));
  const latest = points.at(-1);
  const previous = points.at(-2);
  return {
    today: latest ? { date: latest.date, value: latest.value } : null,
    points,
    change:
      latest && previous
        ? {
            since: { key: previous.key, label: previous.label, date: previous.date },
            value: latest.value - previous.value,
          }
        : null,
    unconvertedCount: report.unconvertedCount,
  };
}

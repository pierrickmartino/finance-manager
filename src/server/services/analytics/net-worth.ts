import { accountsHref } from '@/lib/accounts/links';
import { windowSpan, type PeriodView } from '@/lib/analytics/period-view';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { toChartSource } from '@/lib/reporting/pivot-source';
import type { ServiceContext } from '../context';
import { netWorthPointDate, runNetWorthTrend } from '../reporting';
import type { AnalyticsCard, SectionStatus } from './figures';

/**
 * Analytics' Net worth (GLOSSARY: Net worth, ADR-0014), drawn as the Dashboard's Net worth card:
 * every Account's computed balance, loans counting against it, converted to CHF at each date's
 * FX rate (ADR-0002); beside it a trend with a point per period end of the Period window and
 * today, and its change since the end of the previous period; under it what came in, went out
 * and the Profit over the window.
 */
export interface AnalyticsNetWorth extends SectionStatus {
  /** What the card reads as it reads a Dashboard's Widgets: today's balances, and the flows. */
  cards: AnalyticsCard[];
  /** Net worth at each period end of the window, then today, each opening the Accounts then. */
  trend: ChartSource;
}

/**
 * Net worth at a Period view, from the Account balances and the window's income and expense
 * (the Account balances and Spending Insights sections). Its `unconvertedCount` counts Accounts
 * left out of some point for want of an FX rate.
 */
export async function netWorth(
  ctx: ServiceContext,
  view: PeriodView,
  today: string,
  sections: { balances: Promise<AnalyticsCard>; flow: Promise<AnalyticsCard> },
): Promise<AnalyticsNetWorth> {
  const [report, balances, flow] = await Promise.all([
    runNetWorthTrend(ctx, { unit: view, count: windowSpan(view) }),
    sections.balances,
    sections.flow,
  ]);
  const dateOf = (key: unknown) =>
    typeof key === 'string' ? netWorthPointDate(key, view, today) : today;
  const trend = toChartSource(report, {
    hrefOf: (cell) => accountsHref({ date: dateOf(cell.row) }),
    drill: null,
  });
  return {
    cards: [balances, flow],
    trend,
    isEmpty: balances.isEmpty,
    unconvertedCount: report.unconvertedCount,
  };
}

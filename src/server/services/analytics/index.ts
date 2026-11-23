import { presetStarts, type Span, type SpanPreset } from '@/lib/analytics/span';
import type { ServiceContext } from '../context';
import { swissToday } from '../fx/dates';
import { accountBalances } from './account-balances';
import { categoriesPerPeriod } from './categories-per-period';
import { loadDataStart } from './data-start';
import type { AnalyticsCard } from './figures';
import { incomeVsExpense } from './income-vs-expense';
import { netCashFlow } from './net-cash-flow';
import { keyFigures, type AnalyticsKeyFigures } from './key-figures';
import { netWorth, netWorthTrend, type AnalyticsNetWorth } from './net-worth';
import { profitAndLoss, type AnalyticsProfitAndLoss } from './profit-and-loss';
import { recentTransactions, type RecentTransactions } from './recent-transactions';
import { spendingByCategory } from './spending-by-category';
import { lastCompleteMonthInsights, spendingInsights } from './spending-insights';
import { readingOf, type AnalyticsReading } from './reading';

/**
 * The Analytics reporting service (GLOSSARY: Analytics, ADR-0016): the page's only data source.
 * Given a Span, it resolves it once into a reading (from a start date to today, at a grain,
 * split into periods) and returns it with one promise per section, each started at once so the
 * page can stream every section in behind its own placeholder. Every section reads the reading,
 * never the Span.
 *
 * Each section is drawn by the Dashboard's own cards (GLOSSARY: Card), so each hands them what
 * they read from a Widget (`AnalyticsCard`), its figures linked to their Drill-downs back to
 * Analytics. Each is its own module here (`./<section>.ts`) built on the reporting engine, with
 * its own test file (`./<section>.test.ts`). Adding a section is that module, a field in
 * `AnalyticsSections` and a line in `loadAnalytics`.
 */

/** Each section's promise, by name. */
export interface AnalyticsSections {
  keyFigures: Promise<AnalyticsKeyFigures>;
  netWorth: Promise<AnalyticsNetWorth>;
  spendingInsights: Promise<AnalyticsCard>;
  recentTransactions: Promise<RecentTransactions>;
  netCashFlow: Promise<AnalyticsCard>;
  accountBalances: Promise<AnalyticsCard>;
  spendingByCategory: Promise<AnalyticsCard>;
  profitAndLoss: Promise<AnalyticsProfitAndLoss>;
  incomeVsExpense: Promise<AnalyticsCard>;
  categoriesPerPeriod: Promise<AnalyticsCard>;
}

export interface AnalyticsView {
  /** Today's Swiss date, the one every section reads at. */
  today: string;
  /** What every section reads: the Span resolved on today, cut to the data. */
  reading: AnalyticsReading;
  /** Each preset's start date today, cut to the data as it would be read. */
  starts: Record<SpanPreset, string>;
  sections: AnalyticsSections;
}

/**
 * Starts every section of Analytics over a Span, once it is cut to the data: no Span, preset or
 * custom, starts before the first Transaction (`readingOf`; a custom Span's date moves, a preset
 * keeps its name, and the reading carries the effective Span). The sections' promises are not
 * awaited here: the page awaits each where it shows it. Net worth reads the Account balances and
 * the Span's income and expense, and Key figures the Account balances, Net worth's trend and the
 * Span's income and expense, so they share those promises rather than run them again. Spending
 * Insights reads its own months: the last complete one and those before it, whatever the Span.
 */
export async function loadAnalytics(ctx: ServiceContext, span: Span): Promise<AnalyticsView> {
  const today = swissToday();
  const dataStart = await loadDataStart(ctx);
  const reading = readingOf(span, today, dataStart.firstTransaction);
  const balances = accountBalances(ctx, today);
  const flow = spendingInsights(ctx, reading);
  const trend = netWorthTrend(ctx, reading);
  return {
    today,
    reading,
    starts: presetStarts(today, dataStart.firstTransaction),
    sections: {
      keyFigures: keyFigures(ctx, reading, { balances, trend, flow }, dataStart),
      netWorth: netWorth(reading, { trend, balances, flow }),
      spendingInsights: lastCompleteMonthInsights(ctx, reading),
      recentTransactions: recentTransactions(ctx),
      netCashFlow: netCashFlow(ctx, reading),
      accountBalances: balances,
      spendingByCategory: spendingByCategory(ctx, reading),
      profitAndLoss: profitAndLoss(ctx, reading, dataStart),
      incomeVsExpense: incomeVsExpense(ctx, reading),
      categoriesPerPeriod: categoriesPerPeriod(ctx, reading),
    },
  };
}

export type { AnalyticsPeriod, AnalyticsReading } from './reading';
export type { AnalyticsCard, SectionStatus } from './figures';
export type { AnalyticsKeyFigures, KeyFigure, KeyFigureId } from './key-figures';
export type { KeyFigureChange } from './key-figure-change';
export type { AnalyticsNetWorth } from './net-worth';
export type {
  AnalyticsProfitAndLoss,
  ProfitAndLossRow,
  ProfitAndLossRowId,
} from './profit-and-loss';
export type { RecentTransactions } from './recent-transactions';
export { ACCOUNT_BALANCES } from './account-balances';
export { CATEGORIES_PER_PERIOD } from './categories-per-period';
export { INCOME_VS_EXPENSE } from './income-vs-expense';
export { KEY_FIGURES } from './key-figures';
export { NET_CASH_FLOW } from './net-cash-flow';
export { PROFIT_AND_LOSS } from './profit-and-loss';
export { SPENDING_BY_CATEGORY } from './spending-by-category';
export { SPENDING_INSIGHTS } from './spending-insights';

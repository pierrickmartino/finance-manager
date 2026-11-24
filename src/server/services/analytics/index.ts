import {
  NO_PINS,
  presetLabel,
  presetStarts,
  type CardPeriods,
  type PinnableSection,
  type Period,
  type PeriodPreset,
} from '@/lib/analytics/period';
import type { ServiceContext } from '../context';
import { swissToday } from '../fx/dates';
import { accountBalances } from './account-balances';
import { categoriesPerInterval } from './categories-per-interval';
import { loadDataStart, type DataStart } from './data-start';
import type { AnalyticsCard, SharedSections } from './figures';
import { profitPerInterval } from './profit-per-interval';
import { incomeVsExpense } from './income-vs-expense';
import { loadComparison, type Comparison } from './key-figure-change';
import { netCashFlow } from './net-cash-flow';
import { keyFigures, type AnalyticsKeyFigures } from './key-figures';
import { netWorth, netWorthTrend, type AnalyticsNetWorth } from './net-worth';
import { profitAndLoss, type AnalyticsProfitAndLoss } from './profit-and-loss';
import { recentTransactions, type RecentTransactions } from './recent-transactions';
import { spendingByCategory } from './spending-by-category';
import { lastCompleteMonthInsights, spendingInsights } from './spending-insights';
import { cardReading, readingOf, type AnalyticsReading } from './reading';

/**
 * The Analytics reporting service (GLOSSARY: Analytics, ADR-0016): the page's only data source.
 * Given a Period, it resolves it once into a reading (from a start date to today, at a grain,
 * split into intervals) and returns it with one promise per section, each started at once so the
 * page can stream every section in behind its own placeholder. Every section reads the reading,
 * never the Period.
 *
 * Each section is drawn by the Dashboard's own cards (GLOSSARY: Card), so each hands them what
 * they read from a Widget (`AnalyticsCard`), its figures linked to their Drill-downs back to
 * Analytics. Each is its own module here (`./<section>.ts`) built on the reporting engine, with
 * its own test file (`./<section>.test.ts`). Adding a section is that module, a field in
 * `AnalyticsSections` and a line in `loadAnalytics`.
 */

/**
 * What a pinnable section says besides its figures (GLOSSARY: Card Period): the reading it was
 * read over, its own Period's when pinned, the page's otherwise.
 */
export interface SectionReading {
  reading: AnalyticsReading;
  isPinned: boolean;
  /**
   * The pinned Period in words, its preset's name ("Year to date"), for wherever the section's
   * sentence or captions speak of its Period; null while it follows the page's.
   */
  periodName: string | null;
}

/** A pinnable section's result: its figures, and the reading they were read over. */
export type Pinnable<Result> = Result & SectionReading;

/** Each section's promise, by name. */
export interface AnalyticsSections {
  keyFigures: Promise<AnalyticsKeyFigures>;
  netWorth: Promise<Pinnable<AnalyticsNetWorth>>;
  spendingInsights: Promise<AnalyticsCard>;
  recentTransactions: Promise<RecentTransactions>;
  incomeVsExpense: Promise<Pinnable<AnalyticsCard>>;
  netCashFlow: Promise<Pinnable<AnalyticsCard>>;
  accountBalances: Promise<AnalyticsCard>;
  spendingByCategory: Promise<Pinnable<AnalyticsCard>>;
  profitAndLoss: Promise<Pinnable<AnalyticsProfitAndLoss>>;
  profitPerInterval: Promise<Pinnable<AnalyticsCard>>;
  categoriesPerInterval: Promise<Pinnable<AnalyticsCard>>;
}

export interface AnalyticsView {
  /** Today's Swiss date, the one every section reads at. */
  today: string;
  /**
   * What every section reads unless pinned: the page's Period resolved on today, cut to the data,
   * on the page with its Cards' pins.
   */
  reading: AnalyticsReading;
  /** Each preset's start date today, cut to the data as it would be read. */
  starts: Record<PeriodPreset, string>;
  sections: AnalyticsSections;
}

/**
 * Each pinnable section's reading: over its Card Period when pinned (resolved from the same today
 * and first Transaction, `cardReading`), the page's otherwise.
 */
function sectionReadings(
  page: AnalyticsReading,
  dataStart: string | null,
): (section: PinnableSection) => SectionReading {
  return (section) => {
    const preset = page.page.cardPeriods[section];
    return preset === undefined
      ? { reading: page, isPinned: false, periodName: null }
      : {
          reading: cardReading(page, preset, dataStart),
          isPinned: true,
          periodName: presetLabel(preset, page.to),
        };
  };
}

/** A pinnable section started over its reading, its result saying which one. */
async function pinnable<Result>(
  read: SectionReading,
  load: (read: SectionReading) => Promise<Result>,
): Promise<Pinnable<Result>> {
  return { ...(await load(read)), ...read };
}

/** The pinnable sections' promises. */
type PinnableSections = Pick<
  AnalyticsSections,
  | 'netWorth'
  | 'incomeVsExpense'
  | 'netCashFlow'
  | 'spendingByCategory'
  | 'profitAndLoss'
  | 'profitPerInterval'
  | 'categoriesPerInterval'
>;

/** What the pinnable sections share with the Key figures while they follow the page. */
interface PageShared {
  sections: SharedSections;
  comparison: Promise<Comparison>;
}

/**
 * Starts the pinnable sections, each over its reading (`sectionReadings`). Unpinned, Net worth and
 * Profit and loss share the Key figures' figures (`PageShared`); pinned, Net worth runs its own
 * trend and income and expense, and Profit and loss its own comparison.
 */
function loadPinnableSections(
  ctx: ServiceContext,
  readingFor: (section: PinnableSection) => SectionReading,
  shared: PageShared,
  dataStart: DataStart,
): PinnableSections {
  const { balances } = shared.sections;
  return {
    netWorth: pinnable(readingFor('net-worth'), ({ reading, isPinned }) =>
      netWorth(
        reading,
        isPinned
          ? { trend: netWorthTrend(ctx, reading), balances, flow: spendingInsights(ctx, reading) }
          : shared.sections,
      ),
    ),
    incomeVsExpense: pinnable(readingFor('income-vs-expense'), ({ reading }) =>
      incomeVsExpense(ctx, reading),
    ),
    netCashFlow: pinnable(readingFor('net-cash-flow'), ({ reading }) => netCashFlow(ctx, reading)),
    spendingByCategory: pinnable(readingFor('spending-by-category'), ({ reading }) =>
      spendingByCategory(ctx, reading),
    ),
    profitAndLoss: pinnable(readingFor('profit-and-loss'), ({ reading, isPinned }) =>
      profitAndLoss(
        ctx,
        reading,
        isPinned ? loadComparison(ctx, reading, dataStart.accountData) : shared.comparison,
      ),
    ),
    profitPerInterval: pinnable(readingFor('profit-per-interval'), ({ reading }) =>
      profitPerInterval(ctx, reading),
    ),
    categoriesPerInterval: pinnable(readingFor('categories-per-interval'), ({ reading }) =>
      categoriesPerInterval(ctx, reading),
    ),
  };
}

/**
 * Starts every section of Analytics over a Period, once it is cut to the data: no Period, preset or
 * custom, starts before the first Transaction (`readingOf`; a custom Period's date moves, a preset
 * keeps its name, and the reading carries the effective Period). The sections' promises are not
 * awaited here: the page awaits each where it shows it. Net worth reads the Account balances and
 * the Period's income and expense, and Key figures the Account balances, Net worth's trend and the
 * Period's income and expense, so they share those promises rather than run them again; Key
 * figures and Profit and loss share what their changes compare with (`loadComparison`). Spending
 * Insights reads its own months: the last complete one and those before it, whatever the Period.
 *
 * A pinned section (GLOSSARY: Card Period, ADR-0018; `cardPeriods`, none by default) is read over
 * its own preset instead, resolved from the same today and first Transaction, so it is cut to the
 * data like any Period; its result names the reading it was read over. Every Drill-down, pinned or
 * not, leads back to the page with its Period and every pin (the readings' `page`). A pinned Net
 * worth runs its own trend and income and expense; the Key figures keep the page's. A pinned
 * Profit and loss runs its own comparison, over its own Comparison period.
 */
export async function loadAnalytics(
  ctx: ServiceContext,
  period: Period,
  cardPeriods: CardPeriods = NO_PINS,
): Promise<AnalyticsView> {
  const today = swissToday();
  const dataStart = await loadDataStart(ctx);
  const resolved = readingOf(period, today, dataStart.firstTransaction);
  const reading: AnalyticsReading = {
    ...resolved,
    page: { period: resolved.period, cardPeriods },
  };
  const balances = accountBalances(ctx, today);
  const sections: SharedSections = {
    balances,
    trend: netWorthTrend(ctx, reading),
    flow: spendingInsights(ctx, reading),
  };
  const comparison = loadComparison(ctx, reading, dataStart.accountData);
  const readingFor = sectionReadings(reading, dataStart.firstTransaction);
  return {
    today,
    reading,
    starts: presetStarts(today, dataStart.firstTransaction),
    sections: {
      keyFigures: keyFigures(ctx, reading, sections, comparison),
      spendingInsights: lastCompleteMonthInsights(ctx, reading),
      recentTransactions: recentTransactions(ctx),
      accountBalances: balances,
      ...loadPinnableSections(ctx, readingFor, { sections, comparison }, dataStart),
    },
  };
}

export type { AnalyticsInterval, AnalyticsReading } from './reading';
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
export { CATEGORIES_PER_INTERVAL } from './categories-per-interval';
export { INCOME_VS_EXPENSE, INCOME_VS_EXPENSE_WIDGET } from './income-vs-expense';
export { KEY_FIGURES } from './key-figures';
export { NET_CASH_FLOW } from './net-cash-flow';
export { PROFIT_AND_LOSS } from './profit-and-loss';
export { PROFIT_PER_INTERVAL } from './profit-per-interval';
export { SPENDING_BY_CATEGORY } from './spending-by-category';
export { SPENDING_INSIGHTS } from './spending-insights';

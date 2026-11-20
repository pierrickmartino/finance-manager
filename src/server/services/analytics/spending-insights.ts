import type { MonthFlow } from '@/lib/reporting/card';
import { spendingInsight } from '@/lib/reporting/overview';
import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import { cellOf, statusOf, sumOf, type DrillRef, type Figure, type SectionStatus } from './figures';
import { currentKeys, type AnalyticsPeriod } from './window';

/**
 * Analytics' Spending Insights: how the latest complete period's spending compares with the
 * average of the complete periods before it in the Period window, and the share of income kept
 * over those complete periods. Its bars show every period of the window, the current one "to
 * date" but never judged. Spending is a positive amount: expense net of refunds.
 */

/** The insight itself: a headline, then a sentence whose middle part is the change. */
export interface SpendingInsight {
  headline: string;
  detail: [before: string, change: string, after: string];
  /** The latest complete period's spending, the one the insight speaks of. */
  latest: Figure;
  /** The complete periods' spending the change is worked out from, subtotalled per period. */
  change: DrillRef;
  /** The average spending of the complete periods before the latest, in CHF minor units. */
  average: number;
  /** The average's height on the bars' scale, from 0 to 1. */
  averageShare: number;
}

/** One period's bar. */
export interface SpendingInsightBar {
  key: string;
  label: string;
  /** Its spending, positive (negative when refunds outweigh it). */
  expense: number;
  /** Its height, as a share of the tallest bar or the average line, whichever is higher. */
  share: number;
  /** The latest complete period: the one the insight speaks of. */
  isLatest: boolean;
  /** The current period: drawn apart and left out of the judgement. */
  isToDate: boolean;
  drill: DrillRef;
}

/** Empty with no income or expense in the window. */
export interface SpendingInsights extends SectionStatus {
  /** Null with fewer than two complete periods with data. */
  insight: SpendingInsight | null;
  /** Every period of the window, oldest first. */
  bars: SpendingInsightBar[];
}

const TYPES = ['income', 'expense'] as const;

type Cell = (row: string, column: string) => number | null;

type KeyedFlow = MonthFlow & { key: string };

/** Spending: the expense, negated (expense is booked negative); 0 with none booked. */
const spendingOf = (expense: number | null): number => (expense === null ? 0 : -expense);

/**
 * The window's flows from the first period with income or expense on: periods before the data
 * starts are no basis for a judgement, but an empty period after it counts as spending nothing.
 */
function flowsWithData(window: readonly AnalyticsPeriod[], cell: Cell): KeyedFlow[] {
  const hasData = (key: string) => cell(key, 'income') !== null || cell(key, 'expense') !== null;
  const first = window.findIndex((period) => hasData(period.key));
  if (first === -1) return [];
  return window.slice(first).map((period) => {
    const income = cell(period.key, 'income') ?? 0;
    const expense = spendingOf(cell(period.key, 'expense'));
    // MonthFlow's `isPartial` is the Period window's "to date".
    return {
      key: period.key,
      label: period.label,
      isPartial: period.isToDate,
      income,
      expense,
      net: income - expense,
    };
  });
}

/** The average spending of the complete periods before the latest; 0 without any. */
function averageBefore(complete: readonly KeyedFlow[]): number {
  const before = complete.slice(0, -1);
  return before.length === 0 ? 0 : (sumOf(before.map((flow) => flow.expense)) ?? 0) / before.length;
}

export async function spendingInsights(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<SpendingInsights> {
  const report = await runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: [...TYPES] },
    dateRange: windowRange(view),
    rows: view,
    columns: 'categoryGroupType',
  });
  const cell = cellOf(report);
  const flows = flowsWithData(window, cell);
  const latest = flows.filter((flow) => !flow.isPartial).at(-1);
  const average = averageBefore(flows.filter((flow) => !flow.isPartial));
  const spent = (key: string) => spendingOf(cell(key, 'expense'));
  const top = Math.max(average, ...window.map((period) => spent(period.key)));
  const shareOf = (value: number): number => (top <= 0 ? 0 : Math.max(0, value) / top);
  const expenseOf = (row: string): DrillRef => ({
    query: report.query,
    cell: { row, column: 'expense' },
  });
  const reading = spendingInsight(flows, view);

  return {
    insight:
      reading && latest
        ? {
            ...reading,
            latest: { value: latest.expense, drill: expenseOf(latest.key) },
            change: {
              query: report.query,
              cell: {
                row: { except: currentKeys(window) },
                column: 'expense',
                withPeriodSubtotals: true,
              },
            },
            average: Math.round(average),
            averageShare: shareOf(average),
          }
        : null,
    bars: window.map((period) => ({
      ...period,
      expense: spent(period.key),
      share: shareOf(spent(period.key)),
      isLatest: period.key === latest?.key,
      drill: expenseOf(period.key),
    })),
    ...statusOf(report),
  };
}

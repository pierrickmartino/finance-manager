import { accountsHref } from '@/lib/accounts/links';
import { analyticsDrillUrl } from '@/lib/analytics/links';
import type { PeriodView } from '@/lib/analytics/period-view';
import { formatPeriod } from '@/lib/format';
import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { CellRef } from '../reporting/cell-ref';
import { periodKey, periodOf, type DateSpan } from '../reporting/periods';
import type { AnalyticsCard } from './figures';
import { flowSparklines, netWorthSparkline, type SparklinePoint } from './key-figure-sparklines';
import { periodWindow } from './window';

/**
 * Analytics' Key figures (spec #225): the four tiles that open the page. Net worth today, loans
 * counting against it, whatever the Period view; then the current period of the view to date:
 * Income, Expense and Profit (GLOSSARY: Profit). Income and Expense count only the Income and
 * Expense Category groups, signed so a refund nets within Expense; Capital, Transfers and
 * Unclassified Transactions are left out, as in Spending Insights, so the tiles agree with the
 * cards below.
 *
 * Each figure is one tile: its label and amount, its link and what it leaves out. A figure is
 * the place a tile's change and sparkline join it.
 */

export const KEY_FIGURES = 'Key figures';

export type KeyFigureId = 'netWorth' | 'income' | 'expense' | 'profit';

/** What a figure leaves out for want of an FX rate: Transactions, or Accounts for Net worth. */
export interface KeyFigureUnconverted {
  count: number;
  of: 'Transaction' | 'Account';
}

/** One tile's figure. */
export interface KeyFigure {
  id: KeyFigureId;
  label: string;
  /** When the figure stands: "Today", or the current period "to date" ("May 2025 to date"). */
  caption: string;
  /** CHF minor units. Expense is what went out, net of refunds, as a positive amount. */
  value: number;
  /** Nothing to show: Net worth without an Account holding money. */
  isEmpty: boolean;
  /** Where the amount opens: its Drill-down, or the Accounts as of today for Net worth. */
  href: string;
  unconverted: KeyFigureUnconverted;
  /** Its recent trend, a point per period of the window; the current one partial. */
  sparkline: SparklinePoint[];
}

export interface AnalyticsKeyFigures {
  /** The current period of the Period view, to date. */
  current: { key: string; label: string; span: DateSpan };
  /** Net worth, Income, Expense, Profit: the tiles in order. */
  figures: KeyFigure[];
}

/** The Net worth trend the Net worth section reads: its last point stands at today. */
function netWorthToday(trend: ReportTable): number {
  return trend.rowTotals.at(-1) ?? 0;
}

/** Income and expense of a stretch of days, by Category group type, as Spending Insights reads them. */
function runFlow(ctx: ServiceContext, span: DateSpan): Promise<ReportTable> {
  return runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: ['income', 'expense'] },
    dateRange: { kind: 'fixed', from: span.from, to: span.to },
    rows: 'categoryGroupType',
    columns: null,
  });
}

/** A flow report's Category group type total; 0 when nothing of it falls in the span. */
function typeTotal(report: ReportTable, type: 'income' | 'expense'): number {
  const index = report.rows.findIndex((row) => row.key === type);
  return index < 0 ? 0 : (report.rowTotals[index] ?? 0);
}

export async function keyFigures(
  ctx: ServiceContext,
  view: PeriodView,
  today: string,
  sections: {
    balances: Promise<AnalyticsCard>;
    trend: Promise<ReportTable>;
    flow: Promise<AnalyticsCard>;
  },
): Promise<AnalyticsKeyFigures> {
  const span = { from: periodOf(today, view).from, to: today };
  const key = periodKey(today, view);
  const [flow, balances, trend, perPeriod] = await Promise.all([
    runFlow(ctx, span),
    sections.balances,
    sections.trend,
    sections.flow,
  ]);
  const sparklines = flowSparklines(perPeriod.data, periodWindow(view, today));
  const caption = `${formatPeriod(key)} to date`;
  const drill = (cell: CellRef) => analyticsDrillUrl(view, flow.query, cell);
  const transactions: KeyFigureUnconverted = { count: flow.unconvertedCount, of: 'Transaction' };
  const income = typeTotal(flow, 'income');
  // Booked negative: what went out is its opposite (and 0, not -0, when nothing did).
  const expense = 0 - typeTotal(flow, 'expense');
  const flowFigure = (
    id: Exclude<KeyFigureId, 'netWorth'>,
    label: string,
    value: number,
    cell: CellRef,
  ): KeyFigure => ({
    id,
    label,
    caption,
    value,
    isEmpty: false,
    href: drill(cell),
    unconverted: transactions,
    sparkline: sparklines[id],
  });
  return {
    current: { key, label: formatPeriod(key), span },
    figures: [
      {
        id: 'netWorth',
        label: 'Net worth',
        caption: 'Today',
        value: netWorthToday(trend),
        isEmpty: balances.isEmpty,
        href: accountsHref({ date: today }),
        unconverted: { count: balances.unconvertedCount, of: 'Account' },
        sparkline: netWorthSparkline(trend),
      },
      flowFigure('income', 'Income', income, { row: 'income' }),
      flowFigure('expense', 'Expense', expense, { row: 'expense' }),
      // The report holds only Income and Expense groups: its total is both of them.
      flowFigure('profit', 'Profit', income - expense, {}),
    ],
  };
}

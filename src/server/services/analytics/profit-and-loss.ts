import { analyticsDrillUrl } from '@/lib/analytics/links';
import { transactionListHref } from '@/lib/transactions/links';
import type { ServiceContext } from '../context';
import { listCellTransactions, runWidgetQuery, type ReportTable } from '../reporting';
import type { CellRef } from '../reporting/cell-ref';
import { widgetQueryInput, type WidgetQuery, type WidgetQueryInput } from '../reporting/query';
import { comparisonSpan } from './comparison-span';
import type { DataStart } from './data-start';
import { flowFigures } from './flow-figures';
import {
  bothStretchesRange,
  spanChange,
  type ComparisonWindow,
  type GoodWay,
  type KeyFigureChange,
} from './key-figure-change';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Profit and loss (GLOSSARY: Profit and loss; spec #247): a short statement of the
 * whole Span, totals only. Income, Expense (shown positive), Profit (Income − Expense), Capital
 * netted over all its groups, Unclassified (only when the Span has any) and Net cash flow
 * (Profit + Capital + Unclassified). It reads the Net cash flow section's query by Category group
 * type (every non-Transfer flow, Capital included), so its Net cash flow is that section's total;
 * Transfers, whole or Split-line sides, are left out and Split lines count by their own Category.
 *
 * Each row's change against the Comparison span follows the Key figures' rule; Capital and
 * Unclassified are neutral, so a property sale or a classification backlog is neither good nor bad.
 */

export const PROFIT_AND_LOSS = 'Profit and loss';

export type ProfitAndLossRowId =
  'income' | 'expense' | 'profit' | 'capital' | 'unclassified' | 'netCashFlow';

export interface ProfitAndLossRow {
  id: ProfitAndLossRowId;
  label: string;
  /** Over the Span, CHF minor units. Expense is what went out, net of refunds, as a positive amount. */
  value: number;
  /**
   * What the amount opens: its Drill-down over the Span, or for Unclassified the Transactions
   * list filtered to Unclassified over the Span's dates.
   */
  href: string;
  /** Its Transactions left out for want of an FX rate. */
  unconverted: number;
  /**
   * Over the Comparison span, CHF minor units, as `value` is read; null when the Account data
   * doesn't reach back to the Comparison span.
   */
  earlier: number | null;
  /**
   * Against its value over the Comparison span, opening the Transactions of both stretches; null
   * when the Account data doesn't reach back to the Comparison span.
   */
  change: KeyFigureChange | null;
}

export interface AnalyticsProfitAndLoss {
  /** The statement's rows, in order; Net cash flow last. */
  rows: ProfitAndLossRow[];
}

/** A Category group type, as a key of the report's rows: `null` is Unclassified. */
type GroupTypeKey = 'income' | 'expense' | 'capital' | null;

/** Each row's cell of the report: what it adds up and what its Drill-down lists. */
const CELLS: Record<ProfitAndLossRowId, CellRef> = {
  income: { row: 'income' },
  expense: { row: 'expense' },
  profit: { row: { except: ['capital', null] } },
  capital: { row: 'capital' },
  unclassified: { row: null },
  netCashFlow: {},
};

/** Each row's cell of the both-stretches report, a column per Category group type. */
const BOTH_CELLS: Record<ProfitAndLossRowId, CellRef> = {
  income: { column: 'income', withPeriodSubtotals: true },
  expense: { column: 'expense', withPeriodSubtotals: true },
  profit: { column: { except: ['capital', null] }, withPeriodSubtotals: true },
  capital: { column: 'capital', withPeriodSubtotals: true },
  unclassified: { column: null, withPeriodSubtotals: true },
  netCashFlow: { withPeriodSubtotals: true },
};

/** Which way each row is good: more spending never is; Capital and Unclassified neither way. */
const GOOD_WAYS: Record<ProfitAndLossRowId, GoodWay> = {
  income: 'up',
  expense: 'down',
  profit: 'up',
  capital: 'neutral',
  unclassified: 'neutral',
  netCashFlow: 'up',
};

const LABELS: Record<ProfitAndLossRowId, string> = {
  income: 'Income',
  expense: 'Expense',
  profit: 'Profit',
  capital: 'Capital',
  unclassified: 'Unclassified',
  netCashFlow: 'Net cash flow',
};

const ORDER: readonly ProfitAndLossRowId[] = [
  'income',
  'expense',
  'profit',
  'capital',
  'unclassified',
  'netCashFlow',
];

/** A Category group type's total in the report; 0 when nothing of it falls in the Span. */
function typeTotal(report: ReportTable, type: GroupTypeKey): number {
  const index = report.rows.findIndex((row) => row.key === type);
  return index < 0 ? 0 : (report.rowTotals[index] ?? 0);
}

/** The rows' values from the report's totals by Category group type. */
function valuesOf(report: ReportTable): Record<ProfitAndLossRowId, number> {
  const { income, expense, profit } = flowFigures(
    typeTotal(report, 'income'),
    typeTotal(report, 'expense'),
  );
  const capital = typeTotal(report, 'capital');
  const unclassified = typeTotal(report, null);
  return {
    income,
    expense,
    profit,
    capital,
    unclassified,
    netCashFlow: profit + capital + unclassified,
  };
}

/** How many of a cell's Transactions are left out for want of an FX rate. */
async function unconvertedIn(ctx: ServiceContext, report: ReportTable, cell: CellRef) {
  const page = await listCellTransactions(ctx, report.query, { ...cell, pageSize: 1 });
  return page.unconvertedCount;
}

/** Unclassified shows only when the Span has some: an amount, or one left unconverted. */
const isShown = (row: ProfitAndLossRow) =>
  row.id !== 'unclassified' || row.value !== 0 || row.unconverted > 0;

/** The Net cash flow section's query, by Category group type: every non-Transfer flow. */
const byGroupType = (dateRange: WidgetQueryInput['dateRange']): WidgetQueryInput => ({
  dateRange,
  rows: 'categoryGroupType',
  columns: null,
  includeCapital: true,
});

/** The same flows over both stretches, by period of the grain: what a change line opens. */
function bothStretchesQuery({ reading, span }: ComparisonWindow): WidgetQuery {
  return widgetQueryInput.parse({
    dateRange: bothStretchesRange(span, { from: reading.from, to: reading.to }),
    rows: reading.grain,
    columns: 'categoryGroupType',
    includeCapital: true,
  });
}

export async function profitAndLoss(
  ctx: ServiceContext,
  reading: AnalyticsReading,
  dataStart: DataStart,
): Promise<AnalyticsProfitAndLoss> {
  const window: ComparisonWindow = {
    reading,
    span: comparisonSpan(reading.span, { from: reading.from, to: reading.to }),
    dataStart: dataStart.accountData,
  };
  const [report, earlierReport] = await Promise.all([
    runWidgetQuery(ctx, byGroupType(reading.range)),
    runWidgetQuery(ctx, byGroupType({ kind: 'fixed', ...window.span })),
  ]);
  const values = valuesOf(report);
  const earlier = valuesOf(earlierReport);
  const both = bothStretchesQuery(window);
  const changeOf = (id: ProfitAndLossRowId): Pick<ProfitAndLossRow, 'earlier' | 'change'> => {
    const change = spanChange(window, [values[id], earlier[id]], {
      goodWay: GOOD_WAYS[id],
      href: analyticsDrillUrl(reading, both, BOTH_CELLS[id]),
    });
    return { earlier: change === null ? null : earlier[id], change };
  };
  const unconverted = await Promise.all(ORDER.map((id) => unconvertedIn(ctx, report, CELLS[id])));
  const hrefOf = (id: ProfitAndLossRowId) =>
    id === 'unclassified'
      ? transactionListHref({ from: reading.from, to: reading.to, unclassified: true })
      : analyticsDrillUrl(reading, report.query, CELLS[id]);
  const rows = ORDER.map((id, index): ProfitAndLossRow => ({
    id,
    label: LABELS[id],
    value: values[id],
    href: hrefOf(id),
    unconverted: unconverted[index] ?? 0,
    ...changeOf(id),
  }));
  return { rows: rows.filter(isShown) };
}

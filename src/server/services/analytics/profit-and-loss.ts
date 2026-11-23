import { analyticsDrillUrl } from '@/lib/analytics/links';
import { searchValues, transactionsHref } from '@/lib/transactions/links';
import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { AxisSelector, CellRef } from '../reporting/cell-ref';
import { widgetQueryInput } from '../reporting/query';
import { byGroupType, cellCount, hasTransactions, typeTotal } from './by-group-type';
import { flowFigures } from './flow-figures';
import {
  bothStretchesQuery,
  periodChange,
  type BothStretchesFlows,
  type Comparison,
  type GoodDirection,
  type KeyFigureChange,
} from './key-figure-change';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Profit and loss (GLOSSARY: Profit and loss; spec #247): a short statement of the
 * whole Period, totals only. Income, Expense (shown positive), Profit (Income − Expense), Capital
 * netted over all its groups, Unclassified (only when the Period has any) and Net cash flow
 * (Profit + Capital + Unclassified). It reads the Net cash flow section's query by Category group
 * type (every non-Transfer flow, Capital included), so its Net cash flow is that section's total;
 * Transfers, whole or Split-line sides, are left out and Split lines count by their own Category.
 *
 * Each row's change against the Comparison period follows the Key figures' rule, read from the
 * same loads; Capital's and Unclassified's changes are neither good nor bad.
 */

export const PROFIT_AND_LOSS = 'Profit and loss';

export type ProfitAndLossRowId =
  'income' | 'expense' | 'profit' | 'capital' | 'unclassified' | 'netCashFlow';

export interface ProfitAndLossRow {
  id: ProfitAndLossRowId;
  label: string;
  /** Over the Period, CHF minor units. Expense is what went out, net of refunds, as a positive amount. */
  value: number;
  /**
   * What the amount opens: its Drill-down over the Period, or for Unclassified the Transactions
   * list filtered to Unclassified over the Period's dates.
   */
  href: string;
  /** Its Transactions left out for want of an FX rate. */
  unconverted: number;
  /**
   * Over the Comparison period, CHF minor units, as `value` is read; null when the Account data
   * doesn't reach back to the Comparison period.
   */
  earlier: number | null;
  /**
   * Against its value over the Comparison period, opening the Transactions of both stretches; null
   * when the Account data doesn't reach back to the Comparison period.
   */
  change: KeyFigureChange | null;
}

export interface AnalyticsProfitAndLoss {
  /** The statement's rows, in order; Net cash flow last. */
  rows: ProfitAndLossRow[];
}

/** The Period's totals by Category group type, Expense shown positive, and Profit. */
interface GroupTotals {
  income: number;
  expense: number;
  profit: number;
  capital: number;
  unclassified: number;
}

interface RowDefinition {
  id: ProfitAndLossRowId;
  label: string;
  /**
   * Its row of the report by Category group type (absent for all of them): what its amount adds
   * up, and what its Drill-down and its change line list.
   */
  selector?: AxisSelector;
  /** Which direction of its change is good: more spending never is. */
  goodDirection: GoodDirection;
  valueOf: (totals: GroupTotals) => number;
  /**
   * The Unclassified row: it opens the Transactions list filtered to Unclassified rather than a
   * Drill-down, and shows only when the Period has some Unclassified Transactions.
   */
  isUnclassified?: true;
}

const ROWS: readonly RowDefinition[] = [
  {
    id: 'income',
    label: 'Income',
    selector: 'income',
    goodDirection: 'up',
    valueOf: (t) => t.income,
  },
  {
    id: 'expense',
    label: 'Expense',
    selector: 'expense',
    goodDirection: 'down',
    valueOf: (t) => t.expense,
  },
  {
    id: 'profit',
    label: 'Profit',
    selector: { except: ['capital', null] },
    goodDirection: 'up',
    valueOf: (t) => t.profit,
  },
  // A property sale or a classification backlog is neither good nor bad.
  {
    id: 'capital',
    label: 'Capital',
    selector: 'capital',
    goodDirection: 'neither',
    valueOf: (t) => t.capital,
  },
  {
    id: 'unclassified',
    label: 'Unclassified',
    selector: null,
    goodDirection: 'neither',
    valueOf: (t) => t.unclassified,
    isUnclassified: true,
  },
  {
    id: 'netCashFlow',
    label: 'Net cash flow',
    goodDirection: 'up',
    valueOf: (t) => t.profit + t.capital + t.unclassified,
  },
];

/** The Net cash flow section's flows: every non-Transfer flow, Capital included. */
const EVERY_FLOW: BothStretchesFlows = { includeCapital: true };

/** A report's totals by Category group type. */
function totalsOf(report: ReportTable): GroupTotals {
  const flows = flowFigures(typeTotal(report, 'income'), typeTotal(report, 'expense'));
  return { ...flows, capital: typeTotal(report, 'capital'), unclassified: typeTotal(report, null) };
}

/** The row's cell of the Period's report, a row per Category group type. */
const periodCell = ({ selector }: RowDefinition): CellRef =>
  selector === undefined ? {} : { row: selector };

/** The row's cell of the both-stretches report, a column per Category group type. */
const bothCell = ({ selector }: RowDefinition): CellRef => ({
  ...(selector === undefined ? {} : { column: selector }),
  withPeriodSubtotals: true,
});

/**
 * The statement over the reading, each row against the Comparison period the Key figures read
 * (`loadComparison`, shared).
 */
export async function profitAndLoss(
  ctx: ServiceContext,
  reading: AnalyticsReading,
  comparisonLoad: Promise<Comparison>,
): Promise<AnalyticsProfitAndLoss> {
  const [report, comparison] = await Promise.all([
    runWidgetQuery(ctx, byGroupType(reading.range)),
    comparisonLoad,
  ]);
  const counts = await Promise.all(ROWS.map((row) => cellCount(ctx, report, periodCell(row))));
  const totals = totalsOf(report);
  const earlierTotals = totalsOf(comparison.earlier);
  const both = widgetQueryInput.parse(bothStretchesQuery(comparison, EVERY_FLOW));
  const unclassifiedList = transactionsHref(
    searchValues({ from: reading.from, to: reading.to, unclassified: 'true' }),
  );
  const rowOf = (definition: RowDefinition, index: number): ProfitAndLossRow => {
    const { id, label, goodDirection, valueOf, isUnclassified } = definition;
    const [value, earlier] = [valueOf(totals), valueOf(earlierTotals)];
    const change = periodChange(comparison, [value, earlier], {
      goodDirection,
      href: analyticsDrillUrl(reading.page, both, bothCell(definition)),
    });
    return {
      id,
      label,
      value,
      href: isUnclassified
        ? unclassifiedList
        : analyticsDrillUrl(reading.page, report.query, periodCell(definition)),
      unconverted: counts[index]?.unconverted ?? 0,
      earlier: change === null ? null : earlier,
      change,
    };
  };
  return {
    rows: ROWS.flatMap((definition, index) =>
      // Unclassified shows when the Period has any, counted or not, even if they net to zero.
      definition.isUnclassified && !hasTransactions(counts[index]!)
        ? []
        : [rowOf(definition, index)],
    ),
  };
}

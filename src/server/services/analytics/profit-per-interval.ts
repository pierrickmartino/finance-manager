import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import type { AxisSelector } from '../reporting/cell-ref';
import {
  byGroupType,
  cellCount,
  hasTransactions,
  UNCLASSIFIED_CELL,
  type GroupTypeKey,
} from './by-group-type';
import {
  analyticsCard,
  cellOf,
  intervalRow,
  intervalRowsSource,
  statusOf,
  sumOf,
  type AnalyticsCard,
} from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Profit per interval, drawn as the Dashboard's heatmap card: Income, Expense and
 * Capital per interval of the Period, then Profit (Income − Expense), Unclassified (only when the
 * Period has any) and Net cash flow (Profit + Capital + Unclassified), each with its Total.
 * Signed CHF amounts, as booked: expense is negative and a refund nets within it. Figures go
 * by Category group type; Transfers (whole Transactions and Split-line sides) are left out and
 * Split lines count by their own Category (the reporting engine's base rows). Net cash flow is
 * every flow the report holds, as the Net cash flow section reads it.
 */

export const PROFIT_PER_INTERVAL = 'Profit per interval';

export type ProfitPerIntervalRow =
  'income' | 'expense' | 'capital' | 'profit' | 'unclassified' | 'netCashFlow';

interface RowDefinition {
  key: ProfitPerIntervalRow;
  label: string;
  /** The Category group types the row adds up. */
  types: readonly GroupTypeKey[];
  /** The same types as a selector on the report's rows; absent for all of them. */
  selector?: AxisSelector;
}

const ROWS: readonly RowDefinition[] = [
  { key: 'income', label: 'Income', types: ['income'], selector: 'income' },
  { key: 'expense', label: 'Expense', types: ['expense'], selector: 'expense' },
  { key: 'capital', label: 'Capital', types: ['capital'], selector: 'capital' },
  {
    key: 'profit',
    label: 'Profit',
    types: ['income', 'expense'],
    selector: { except: ['capital', null] },
  },
  { key: 'unclassified', label: 'Unclassified', types: [null], selector: null },
  { key: 'netCashFlow', label: 'Net cash flow', types: ['income', 'expense', 'capital', null] },
];

export async function profitPerInterval(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  const report = await runWidgetQuery(ctx, byGroupType(reading.range, reading.grain));
  // Unclassified shows when the Period has any Unclassified Transactions, even netting to zero.
  const hasUnclassified = hasTransactions(await cellCount(ctx, report, UNCLASSIFIED_CELL));
  const cell = cellOf(report);
  const shown = ROWS.filter(({ key }) => key !== 'unclassified' || hasUnclassified);
  const rows = shown.map(({ key, label, types, selector }) =>
    intervalRow(reading, {
      key,
      label,
      query: report.query,
      selector,
      valueAt: (interval) => sumOf(types.map((type) => cell(type, interval))),
    }),
  );
  return analyticsCard({
    id: 'profit-per-interval',
    name: PROFIT_PER_INTERVAL,
    visualisation: 'table',
    rows: 'categoryGroupType',
    data: intervalRowsSource(reading, rows, report),
    status: statusOf(report),
  });
}

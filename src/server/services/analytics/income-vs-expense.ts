import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import type { AxisSelector } from '../reporting/cell-ref';
import {
  analyticsCard,
  cellOf,
  periodRow,
  periodRowsSource,
  statusOf,
  sumOf,
  type AnalyticsCard,
  type PeriodRow,
} from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Income vs. expense, drawn as the Dashboard's heatmap card: Income, Expense and
 * Capital per period of the Span, then Profit (Income − Expense), Unclassified (only when the
 * Span has any) and Net cash flow (Profit + Capital + Unclassified), each with its Total.
 * Signed CHF amounts, as booked: expense is negative and a refund nets within it. Figures go
 * by Category group type; Transfers (whole Transactions and Split-line sides) are left out and
 * Split lines count by their own Category (the reporting engine's base rows). Net cash flow is
 * every flow the report holds, as the Net cash flow section reads it.
 */

export const INCOME_VS_EXPENSE = 'Income vs. expense';

export type IncomeVsExpenseRow =
  'income' | 'expense' | 'capital' | 'profit' | 'unclassified' | 'netCashFlow';

/** A Category group type, as a key of the report's rows: `null` is Unclassified. */
type GroupTypeKey = 'income' | 'expense' | 'capital' | null;

interface RowDefinition {
  key: IncomeVsExpenseRow;
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

/** Unclassified shows only when some period of the Span has an Unclassified flow. */
function isShown(row: PeriodRow): boolean {
  return row.key !== 'unclassified' || row.cells.some((cell) => (cell.value ?? 0) !== 0);
}

export async function incomeVsExpense(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  // The Net cash flow section's query, by Category group type: every non-Transfer flow.
  const report = await runWidgetQuery(ctx, {
    dateRange: reading.range,
    rows: 'categoryGroupType',
    columns: reading.grain,
    includeCapital: true,
  });
  const cell = cellOf(report);
  const rows = ROWS.map(({ key, label, types, selector }) =>
    periodRow(reading, {
      key,
      label,
      query: report.query,
      selector,
      valueAt: (period) => sumOf(types.map((type) => cell(type, period))),
    }),
  ).filter(isShown);
  return analyticsCard({
    id: 'income-vs-expense',
    name: INCOME_VS_EXPENSE,
    visualisation: 'table',
    rows: 'categoryGroupType',
    data: periodRowsSource(reading, rows, report),
    status: statusOf(report),
  });
}

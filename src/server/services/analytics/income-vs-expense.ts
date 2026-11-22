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
} from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Income vs. expense, drawn as the Dashboard's heatmap card: Income, Expense and
 * Capital per period of the window, then Net (income − expense) and Net incl. Capital, each with
 * its Total. Signed CHF amounts, as booked: expense is negative and a refund nets within it.
 * Transfers are left out and Split lines count by their own Category (the reporting engine's
 * base rows).
 */

export const INCOME_VS_EXPENSE = 'Income vs. expense';

export type IncomeVsExpenseRow = 'income' | 'expense' | 'capital' | 'net' | 'netInclCapital';

const TYPES = ['income', 'expense', 'capital'] as const;

interface RowDefinition {
  key: IncomeVsExpenseRow;
  label: string;
  /** The Category group types the row adds up. */
  types: readonly (typeof TYPES)[number][];
  /** The same types as a selector on the report's Category group type rows. */
  selector?: AxisSelector;
}

const ROWS: readonly RowDefinition[] = [
  { key: 'income', label: 'Income', types: ['income'], selector: 'income' },
  { key: 'expense', label: 'Expense', types: ['expense'], selector: 'expense' },
  { key: 'capital', label: 'Capital', types: ['capital'], selector: 'capital' },
  // The type filter leaves no Unclassified bucket, so "every type but Capital" is exactly these.
  {
    key: 'net',
    label: 'Net (income − expense)',
    types: ['income', 'expense'],
    selector: { except: ['capital'] },
  },
  { key: 'netInclCapital', label: 'Net incl. Capital', types: TYPES },
];

export async function incomeVsExpense(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  const report = await runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: [...TYPES] },
    dateRange: reading.range,
    rows: 'categoryGroupType',
    columns: reading.grain,
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
  );
  return analyticsCard({
    id: 'income-vs-expense',
    name: INCOME_VS_EXPENSE,
    visualisation: 'table',
    rows: 'categoryGroupType',
    data: periodRowsSource(reading, rows, report),
    status: statusOf(report),
  });
}

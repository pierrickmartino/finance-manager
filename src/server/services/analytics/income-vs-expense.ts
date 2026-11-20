import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import type { AxisSelector } from '../reporting/cell-ref';
import { cellOf, periodRow, sumOf, type PeriodTable } from './figures';
import type { AnalyticsPeriod } from './window';

/**
 * Analytics' Income vs. expense table: Income, Expense and Capital per period of the window,
 * then Net (income − expense) and Net incl. Capital. Signed CHF amounts, as booked: expense is
 * negative and a refund nets within it. Transfers are left out and Split lines count by their
 * own Category (the reporting engine's base rows).
 */

export type IncomeVsExpenseRow = 'income' | 'expense' | 'capital' | 'net' | 'netInclCapital';
export type IncomeVsExpense = PeriodTable<IncomeVsExpenseRow>;

const TYPES = ['income', 'expense', 'capital'] as const;

interface RowDefinition {
  key: IncomeVsExpenseRow;
  label: string;
  /** The Category group types the row adds up. */
  types: readonly (typeof TYPES)[number][];
  /** The same types as a selector on the report's Category group type rows. */
  row?: AxisSelector;
}

const ROWS: readonly RowDefinition[] = [
  { key: 'income', label: 'Income', types: ['income'], row: 'income' },
  { key: 'expense', label: 'Expense', types: ['expense'], row: 'expense' },
  { key: 'capital', label: 'Capital', types: ['capital'], row: 'capital' },
  // The type filter leaves no Unclassified bucket, so "every type but Capital" is exactly these.
  {
    key: 'net',
    label: 'Net (income − expense)',
    types: ['income', 'expense'],
    row: { except: ['capital'] },
  },
  { key: 'netInclCapital', label: 'Net incl. Capital', types: TYPES },
];

export async function incomeVsExpense(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<IncomeVsExpense> {
  const report = await runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: [...TYPES] },
    dateRange: windowRange(view),
    rows: 'categoryGroupType',
    columns: view,
  });
  const cell = cellOf(report);
  return {
    periods: [...window],
    rows: ROWS.map(({ key, label, types, row }) =>
      periodRow(view, window, {
        key,
        label,
        query: report.query,
        row,
        valueAt: (period) => sumOf(types.map((type) => cell(type, period))),
      }),
    ),
    isEmpty: report.total === null,
    unconvertedCount: report.unconvertedCount,
  };
}

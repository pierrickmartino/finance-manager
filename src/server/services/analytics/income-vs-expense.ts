import type { CardSource } from '@/lib/reporting/card';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import type { WidgetQueryInput } from '../reporting/query';
import { analyticsCard, reportSource, statusOf, type AnalyticsCard } from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Income vs. expense (ADR-0020), drawn as the Dashboard's card for a line Widget by
 * Day with income and expense columns: two overlapping areas, each point the running total from
 * the reading's first day, so the last gap is the Period's Profit. Always by day, whatever the
 * Period's length. Only the Income and Expense Category groups count: Capital and Unclassified
 * Transactions are left out, as are Transfers (whole and Split-line sides); Split lines count by
 * their own Category, refunds net within expense and foreign amounts are in CHF at each
 * Transaction's date (the reporting engine's base rows).
 */

export const INCOME_VS_EXPENSE = 'Income vs. expense';

/**
 * The Widget the card is drawn as, before its figures arrive: a line by Day with a column per
 * Category group type, so its placeholder hints at the two areas.
 */
export const INCOME_VS_EXPENSE_WIDGET = {
  source: 'query',
  visualisation: 'line',
  query: { rows: 'day', columns: 'categoryGroupType' },
  data: null,
} as const satisfies CardSource;

/** The query behind the card: income and expense, a row per day of the reading. */
const incomeAndExpenseByDay = (reading: AnalyticsReading): WidgetQueryInput => ({
  filters: { categoryGroupTypes: ['income', 'expense'] },
  dateRange: reading.range,
  ...INCOME_VS_EXPENSE_WIDGET.query,
});

export async function incomeVsExpense(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  const report = await runWidgetQuery(ctx, incomeAndExpenseByDay(reading));
  const { visualisation, query } = INCOME_VS_EXPENSE_WIDGET;
  return analyticsCard({
    id: 'income-vs-expense',
    name: INCOME_VS_EXPENSE,
    visualisation,
    ...query,
    data: reportSource(report, reading),
    status: statusOf(report),
  });
}

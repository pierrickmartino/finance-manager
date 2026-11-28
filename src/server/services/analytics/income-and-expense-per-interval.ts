import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import { analyticsCard, reportSource, statusOf, type AnalyticsCard } from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Income and expense per interval (ADR-0022), drawn as the Dashboard's card for a bars
 * flow: a bars Widget by the reading's Interval with a column per Category group type, an Income
 * bar and an Expense bar for every Interval of the Period. Only the Income and Expense Category
 * groups count: Capital and Unclassified Transactions are left out, as are Transfers (the
 * reporting engine's base rows). Each bar opens the Drill-down of its Interval and side.
 */

export const INCOME_AND_EXPENSE_PER_INTERVAL = 'Income and expense per interval';

export async function incomeAndExpensePerInterval(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  const report = await runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: ['income', 'expense'] },
    dateRange: reading.range,
    rows: reading.grain,
    columns: 'categoryGroupType',
  });
  return analyticsCard({
    id: 'income-and-expense-per-interval',
    name: INCOME_AND_EXPENSE_PER_INTERVAL,
    visualisation: 'stacked_bar',
    rows: reading.grain,
    columns: 'categoryGroupType',
    data: reportSource(report, reading),
    status: statusOf(report),
  });
}

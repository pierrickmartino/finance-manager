import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import { analyticsCard, reportSource, statusOf, type AnalyticsCard } from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Spending by Category, drawn as the Dashboard's card for a stacked bar Widget: a
 * bar per period of the window stacked by Expense Category, read from 3 Categories on as a
 * ranking of the 6 largest over the whole window, with the heaviest and lightest periods.
 * Signed CHF amounts, as booked: spending is negative and a refund nets within its Category.
 * Transfers are left out and Split lines count by their own Category (the reporting engine's
 * base rows).
 */

export const SPENDING_BY_CATEGORY = 'Spending by Category';

/**
 * The report with its Categories largest spending first (the most negative total; ties keep
 * the Categories' own order): a chart keeps its first series by name and folds the rest, so
 * the ones it names are the largest.
 */
function largestFirst(report: ReportTable): ReportTable {
  const order = report.columns
    .map((_, c) => c)
    .sort((a, b) => (report.columnTotals[a] ?? 0) - (report.columnTotals[b] ?? 0) || a - b);
  const pick = <T>(values: readonly T[]): T[] => order.map((c) => values[c]!);
  return {
    ...report,
    columns: pick(report.columns),
    columnTotals: pick(report.columnTotals),
    cells: report.cells.map(pick),
  };
}

export async function spendingByCategory(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  const report = await runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: ['expense'] },
    dateRange: reading.range,
    rows: reading.grain,
    columns: 'category',
  });
  return analyticsCard({
    id: 'spending-by-category',
    name: SPENDING_BY_CATEGORY,
    visualisation: 'stacked_bar',
    rows: reading.grain,
    // The type filter leaves no Unclassified bucket: every column is an Expense Category.
    data: reportSource(largestFirst(report), reading),
    status: statusOf(report),
  });
}

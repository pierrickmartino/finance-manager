import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import { analyticsCard, reportSource, statusOf, type AnalyticsCard } from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' income and expense per period of the window: what the Dashboard's overview cards
 * read from an income-vs-expense Widget. The insight card (Spending Insights) sets the latest
 * complete period's spending against the complete ones before it; the Net worth card breaks
 * down what came in, went out and was kept.
 *
 * Periods before the first one with income or expense are left out: they are no basis for a
 * judgement, but an empty period after it counts as spending nothing.
 */

export const SPENDING_INSIGHTS = 'Spending Insights';

/** The report from its first period with income or expense on; all of it when none has any. */
function fromFirstData(report: ReportTable): ReportTable {
  const first = report.cells.findIndex((row) => row.some((value) => value !== null));
  if (first <= 0) return report;
  return {
    ...report,
    rows: report.rows.slice(first),
    cells: report.cells.slice(first),
    rowTotals: report.rowTotals.slice(first),
  };
}

export async function spendingInsights(
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
    id: 'spending-insights',
    name: SPENDING_INSIGHTS,
    visualisation: 'stacked_bar',
    rows: reading.grain,
    data: reportSource(fromFirstData(report), reading),
    status: statusOf(report),
  });
}

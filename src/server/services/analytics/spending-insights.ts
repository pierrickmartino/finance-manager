import { monthIndex, monthStart } from '@/lib/dates';
import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import { analyticsCard, reportSource, statusOf, type AnalyticsCard } from './figures';
import { readingOf, type AnalyticsReading } from './reading';

/**
 * Analytics' income and expense per period: what the Dashboard's overview cards read from an
 * income-vs-expense Widget. Over the Span (`spendingInsights`), the Key figures and the Net
 * worth card break down what came in, went out and was kept. The insight card (Spending
 * Insights, `lastCompleteMonthInsights`) does not follow the Span (ADR-0016): it sets the last
 * complete month's spending against the months before it.
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

/** How many complete months the insight reads: the last one, judged against those before it. */
const INSIGHT_MONTHS = 12;

/**
 * What the insight reads, whatever the Span: by month, the INSIGHT_MONTHS complete months
 * before today's, then this month to date (never judged). It keeps the reading's Span, so its
 * Drill-downs lead back to the Span the page is read over.
 */
function insightReading(reading: AnalyticsReading): AnalyticsReading {
  const from = monthStart(monthIndex(reading.to) - INSIGHT_MONTHS);
  return { ...readingOf({ kind: 'custom', from }, reading.to), span: reading.span };
}

/** The Span's income and expense per period, which the Key figures and Net worth share. */
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

/** Spending Insights: the last complete month against the months before it, whatever the Span. */
export function lastCompleteMonthInsights(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  return spendingInsights(ctx, insightReading(reading));
}

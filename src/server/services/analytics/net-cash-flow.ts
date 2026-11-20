import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import { cellOf, statusOf, type Figure, type SectionStatus } from './figures';
import type { AnalyticsPeriod } from './window';

/**
 * Analytics' Net cash flow line: every flow in or out of the household per period of the
 * window, signed CHF. Capital is included (as on the starter Net cash flow Widget, so are
 * uncategorised Transactions); Transfers are left out by the reporting engine's base rows.
 */

/** One point of the line: a period of the window and its net flow. */
export interface NetCashFlowPoint extends AnalyticsPeriod, Figure {}

/** Empty when no Transaction falls in the window. */
export interface NetCashFlow extends SectionStatus {
  /** One per period of the window, oldest first; the last is the current one, to date. */
  points: NetCashFlowPoint[];
}

export async function netCashFlow(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<NetCashFlow> {
  const report = await runWidgetQuery(ctx, {
    dateRange: windowRange(view),
    rows: view,
    columns: null,
    includeCapital: true,
  });
  const cell = cellOf(report);
  const column = report.columns[0]?.key ?? null;
  return {
    points: window.map((period) => ({
      ...period,
      value: cell(period.key, column),
      drill: { query: report.query, cell: { row: period.key } },
    })),
    ...statusOf(report),
  };
}

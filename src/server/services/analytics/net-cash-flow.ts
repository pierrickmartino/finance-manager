import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import { analyticsCard, reportSource, statusOf, type AnalyticsCard } from './figures';

/**
 * Analytics' Net cash flow, drawn as the Dashboard's card for a line Widget: every flow in or
 * out of the household per period of the window, signed CHF, with the best and weakest
 * periods. Capital is included (as on the starter Net cash flow Widget, so are uncategorised
 * Transactions); Transfers are left out by the reporting engine's base rows.
 */

export const NET_CASH_FLOW = 'Net cash flow';

export async function netCashFlow(ctx: ServiceContext, view: PeriodView): Promise<AnalyticsCard> {
  const report = await runWidgetQuery(ctx, {
    dateRange: windowRange(view),
    rows: view,
    columns: null,
    includeCapital: true,
  });
  return analyticsCard({
    id: 'net-cash-flow',
    name: NET_CASH_FLOW,
    visualisation: 'line',
    rows: view,
    data: reportSource(report, view),
    status: statusOf(report),
  });
}

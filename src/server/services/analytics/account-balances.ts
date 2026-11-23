import { BALANCE_LINKS, toChartSource } from '@/lib/reporting/pivot-source';
import type { ServiceContext } from '../context';
import { runAccountBalances } from '../reporting/balances';
import { widgetQueryInput, type WidgetQuery } from '../reporting/query';
import { analyticsCard, type AnalyticsCard } from './figures';

/**
 * Analytics' Account balances in CHF, drawn as the Dashboard's card for the starter balances
 * Widget: each Account's balance today, converted to the Base currency at today's FX rate (an
 * archived Account only while it still holds money), each opening its Account. It doesn't
 * depend on the Period. Its `unconvertedCount` counts Accounts left out of the total for
 * want of an FX rate.
 */

export const ACCOUNT_BALANCES = 'Account balances in CHF';

/** One row per Account and no time axis: the balances on a day (the date range goes unused). */
const BALANCES_QUERY: WidgetQuery = widgetQueryInput.parse({
  dateRange: { kind: 'last', count: 1, unit: 'month' },
  rows: 'account',
  columns: null,
});

export async function accountBalances(ctx: ServiceContext, today: string): Promise<AnalyticsCard> {
  const report = await runAccountBalances(ctx, BALANCES_QUERY, { date: today });
  return analyticsCard({
    id: 'account-balances',
    name: ACCOUNT_BALANCES,
    source: 'account_balances',
    visualisation: 'table',
    rows: 'account',
    data: toChartSource(report, BALANCE_LINKS),
    status: { isEmpty: report.rows.length === 0, unconvertedCount: report.unconvertedCount },
  });
}

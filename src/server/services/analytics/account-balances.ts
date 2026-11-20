import type { ServiceContext } from '../context';
import { runAccountBalances } from '../reporting/balances';
import { widgetQueryInput, type WidgetQuery } from '../reporting/query';
import type { SectionStatus } from './figures';

/**
 * Analytics' Account balances in CHF: each Account's balance today, converted to the Base
 * currency at today's FX rate, as the Dashboard's starter balances Widget shows it (an archived
 * Account only while it still holds money). It doesn't depend on the Period view.
 */

export interface AccountBalanceRow {
  accountId: string;
  /** "Bank · Account". */
  label: string;
  /** The balance in CHF minor units; null with no FX rate for its Currency yet. */
  chfMinor: number | null;
}

/**
 * Empty without an Account; its `unconvertedCount` counts Accounts left out of the total for
 * want of an FX rate.
 */
export interface AccountBalances extends SectionStatus {
  /** The day the balances stand at: today. */
  date: string;
  rows: AccountBalanceRow[];
  /** The converted balances added up; null with none. */
  totalChfMinor: number | null;
}

/** One row per Account and no time axis: the balances on a day (the date range goes unused). */
const BALANCES_QUERY: WidgetQuery = widgetQueryInput.parse({
  dateRange: { kind: 'last', count: 1, unit: 'month' },
  rows: 'account',
  columns: null,
});

export async function accountBalances(
  ctx: ServiceContext,
  today: string,
): Promise<AccountBalances> {
  const report = await runAccountBalances(ctx, BALANCES_QUERY, { date: today });
  return {
    date: today,
    rows: report.rows.map((row, index) => ({
      accountId: row.key!,
      label: row.label,
      chfMinor: report.rowTotals[index] ?? null,
    })),
    totalChfMinor: report.total,
    isEmpty: report.rows.length === 0,
    unconvertedCount: report.unconvertedCount,
  };
}

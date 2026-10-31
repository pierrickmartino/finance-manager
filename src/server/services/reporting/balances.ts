import { listAccountBalances, type AccountBalance } from '../accounts/balances';
import type { ServiceContext } from '../context';
import type { ReportTable } from './engine';
import type { ReportHeader } from './headers';
import type { WidgetQuery } from './query';

/** The single column of the Account balances table. */
export const BALANCE_COLUMN: ReportHeader = {
  key: null,
  label: 'Balance in CHF',
  isPartial: false,
};

/** An archived Account shows only while it still holds money. */
function isShown(balance: AccountBalance): boolean {
  return balance.account.archivedAt === null || balance.balanceMinor !== 0;
}

/**
 * The Account balances in CHF on a date (default today), shaped like a Widget query's result
 * so every visualisation can show it: one row per Account (key = Account id), one column.
 * Accounts with no FX rate yet are left out of the totals and counted in `unconvertedCount`.
 */
export async function runAccountBalances(
  ctx: ServiceContext,
  query: WidgetQuery,
  options: { date?: string } = {},
): Promise<ReportTable> {
  const balances = (await listAccountBalances(ctx, options)).filter(isShown);
  const date = balances[0]?.date ?? options.date ?? '';
  const values = balances.map((balance) => balance.chf?.amountMinor ?? null);
  const converted = values.filter((value): value is number => value !== null);
  const total = converted.length === 0 ? null : converted.reduce((sum, value) => sum + value, 0);
  return {
    query: { ...query, rows: 'account', columns: null, measure: 'sum' },
    range: { from: date, to: date },
    partialPeriod: null,
    rows: balances.map(({ account }) => ({
      key: account.id,
      label: `${account.bankName} · ${account.name}`,
      isPartial: false,
    })),
    columns: [BALANCE_COLUMN],
    cells: values.map((value) => [value]),
    rowTotals: values,
    columnTotals: [total],
    total,
    unconvertedCount: balances.length - converted.length,
  };
}

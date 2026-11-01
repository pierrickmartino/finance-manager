/** Pure helpers for the Accounts page: its links, the selected Account, grouping and totals. */

/** The fields of an Account balance these helpers read (an `AccountBalance` fits). */
export interface BalanceRow {
  account: { id: string; bankName: string; archivedAt: Date | null };
  chf: { amountMinor: number } | null;
}

/** `?account=new` shows the New Account form in the detail pane. */
export const NEW_ACCOUNT = 'new';

/** An Accounts page link: the selected Account (or the New Account form) and the date. */
export function accountsHref(params: { account?: string; date?: string }): string {
  const search = new URLSearchParams();
  if (params.account) search.set('account', params.account);
  if (params.date) search.set('date', params.date);
  const query = search.toString();
  return query ? `/accounts?${query}` : '/accounts';
}

export type Selection<T> = { type: 'new' } | { type: 'account'; row: T };

/**
 * What the detail pane shows: the Account the URL names, else the first one listed; the New
 * Account form when asked for, or when there is no Account yet.
 */
export function selectAccount<T extends BalanceRow>(
  rows: readonly T[],
  accountParam: string | undefined,
): Selection<T> {
  if (accountParam === NEW_ACCOUNT) return { type: 'new' };
  const row = rows.find((candidate) => candidate.account.id === accountParam) ?? rows[0];
  return row ? { type: 'account', row } : { type: 'new' };
}

/** The rows grouped by Bank, Banks and rows in the order they are listed. */
export function groupByBank<T extends BalanceRow>(
  rows: readonly T[],
): { bankName: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    groups.set(row.account.bankName, [...(groups.get(row.account.bankName) ?? []), row]);
  }
  return [...groups].map(([bankName, bankRows]) => ({ bankName, rows: bankRows }));
}

/**
 * The CHF total of the active Accounts. Accounts without an FX rate cannot be summed: they
 * are left out and counted, so the page can say so.
 */
export function totalChfMinor(rows: readonly BalanceRow[]): {
  amountMinor: number;
  missingRates: number;
} {
  const active = rows.filter((row) => !row.account.archivedAt);
  return {
    amountMinor: active.reduce((sum, row) => sum + (row.chf?.amountMinor ?? 0), 0),
    missingRates: active.filter((row) => !row.chf).length,
  };
}

const MS_PER_DAY = 86_400_000;

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The earlier dates the detail pane compares the balance with, oldest first. */
export function balanceDates(date: string): { label: string; date: string }[] {
  return [
    { label: 'End of last year', date: `${Number(date.slice(0, 4)) - 1}-12-31` },
    { label: '90 days earlier', date: daysBefore(date, 90) },
    { label: '30 days earlier', date: daysBefore(date, 30) },
  ];
}

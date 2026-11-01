/** Pure helpers for the Banks page: its links, the per-Bank summaries and the selection. */

import { totalChfMinor } from '../accounts/view';

/** The fields of an Account balance these helpers read (an `AccountBalance` fits). */
export interface BankBalanceRow {
  account: {
    id: string;
    bankId: string;
    bankName: string;
    currency: string;
    archivedAt: Date | null;
  };
  balanceMinor: number;
  chf: { amountMinor: number } | null;
}

export interface BankSummary<T extends BankBalanceRow = BankBalanceRow> {
  bank: { id: string; name: string };
  /** Every Account at the Bank, archived ones included, in the order they are listed. */
  accounts: T[];
  activeCount: number;
  /** CHF total of the active Accounts with an FX rate; loans net against the rest. */
  chfMinor: number;
  /** Active Accounts left out of `chfMinor` for want of an FX rate. */
  missingRates: number;
  /** Per Currency, the total of the active Accounts in its own minor units. */
  byCurrency: { currency: string; amountMinor: number }[];
}

/** `?bank=new` shows the New Bank form in the detail pane. */
export const NEW_BANK = 'new';

/** A Banks page link, naming the selected Bank (or the New Bank form). */
export function banksHref(bank?: string): string {
  return bank ? `/banks?${new URLSearchParams({ bank }).toString()}` : '/banks';
}

function totalsByCurrency(rows: readonly BankBalanceRow[]): BankSummary['byCurrency'] {
  const totals = new Map<string, number>();
  for (const { account, balanceMinor } of rows) {
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + balanceMinor);
  }
  return [...totals].map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/** Every Bank, in the order given, with its Accounts and their totals. */
export function summarizeBanks<T extends BankBalanceRow>(
  banks: readonly { id: string; name: string }[],
  rows: readonly T[],
): BankSummary<T>[] {
  return banks.map((bank) => {
    const accounts = rows.filter((row) => row.account.bankId === bank.id);
    const active = accounts.filter((row) => !row.account.archivedAt);
    const { amountMinor, missingRates } = totalChfMinor(accounts);
    return {
      bank: { id: bank.id, name: bank.name },
      accounts,
      activeCount: active.length,
      chfMinor: amountMinor,
      missingRates,
      byCurrency: totalsByCurrency(active),
    };
  });
}

export type BankSelection<T extends BankBalanceRow> =
  { type: 'new' } | { type: 'bank'; summary: BankSummary<T> };

/**
 * What the detail pane shows: the Bank the URL names, else the first one listed; the New
 * Bank form when asked for, or when there is no Bank yet.
 */
export function selectBank<T extends BankBalanceRow>(
  summaries: readonly BankSummary<T>[],
  bankParam: string | undefined,
): BankSelection<T> {
  if (bankParam === NEW_BANK) return { type: 'new' };
  const summary = summaries.find((s) => s.bank.id === bankParam) ?? summaries[0];
  return summary ? { type: 'bank', summary } : { type: 'new' };
}

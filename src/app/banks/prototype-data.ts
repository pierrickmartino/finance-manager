/*
 * PROTOTYPE — throwaway. The read-only per-Bank summary the Banks page variants render.
 */

import type { AccountBalance } from '@/server/services/accounts/balances';
import type { Bank } from '@/server/services/banks';
import { totalChfMinor } from '../accounts/view';

export interface BankSummary {
  bank: Bank;
  /** Every Account at the Bank, archived ones included, in `listAccounts` order. */
  accounts: AccountBalance[];
  activeCount: number;
  /** CHF total of the active Accounts. */
  chfMinor: number;
  missingRates: number;
  /** Share of the positive CHF total across all Banks (0..1). */
  share: number;
  /** Native-Currency totals of the active Accounts, e.g. CHF and EUR. */
  byCurrency: { currency: string; amountMinor: number }[];
  kinds: string[];
}

export function summarizeBanks(banks: Bank[], balances: AccountBalance[]): BankSummary[] {
  const rows = banks.map((bank) => {
    const accounts = balances.filter((balance) => balance.account.bankId === bank.id);
    const active = accounts.filter((balance) => !balance.account.archivedAt);
    const { amountMinor, missingRates } = totalChfMinor(accounts);
    const currencies = new Map<string, number>();
    for (const { account, balanceMinor } of active) {
      currencies.set(account.currency, (currencies.get(account.currency) ?? 0) + balanceMinor);
    }
    return {
      bank,
      accounts,
      activeCount: active.length,
      chfMinor: amountMinor,
      missingRates,
      share: 0,
      byCurrency: [...currencies].map(([currency, total]) => ({ currency, amountMinor: total })),
      kinds: [...new Set(active.map((balance) => balance.account.kind))],
    };
  });
  const positive = rows.reduce((sum, row) => sum + Math.max(0, row.chfMinor), 0);
  return rows.map((row) => ({
    ...row,
    share: positive > 0 ? Math.max(0, row.chfMinor) / positive : 0,
  }));
}

export const KIND_LABEL: Record<string, string> = {
  current: 'Current',
  savings: 'Savings',
  '3a': '3a',
  loan: 'Loan',
};

/** A stable colour per Bank for the allocation views. */
export const BANK_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
];

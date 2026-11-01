import type { TransactionListItem } from '@/server/services/transactions';

/** The name a Transaction goes by: its Payee, else the bank's counterparty, else its text. */
export function transactionName(transaction: TransactionListItem): string {
  return (
    transaction.payee?.name ??
    transaction.counterpartyName ??
    (transaction.rawDescription || '(no description)')
  );
}

/** Income stands out; expenses stay neutral (they are most rows). */
export function amountClass(amountMinor: number): string {
  return amountMinor > 0 ? 'text-emerald-700 dark:text-emerald-400' : '';
}

/** "Groceries", "Transfer" or "Unclassified", coloured so the last two stand out. */
export function CategoryLabel({ transaction }: { transaction: TransactionListItem }) {
  if (transaction.transferId) {
    return <span className="text-sky-700 dark:text-sky-400">Transfer</span>;
  }
  if (transaction.category) return <>{transaction.category.name}</>;
  return <span className="text-amber-700 dark:text-amber-400">Unclassified</span>;
}

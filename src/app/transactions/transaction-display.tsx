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

type Classified = Pick<TransactionListItem, 'transferId' | 'category' | 'splitLines'>;

/** "Split (3)" for a split Transaction (ADR-0004); null when it is not split. */
export function splitLabel({ splitLines }: Pick<TransactionListItem, 'splitLines'>): string | null {
  return splitLines.length > 0 ? `Split (${splitLines.length})` : null;
}

/** "Groceries", "Transfer", "Split (n)" or "Unclassified" as plain text. */
export function categoryText(transaction: Classified): string {
  if (transaction.transferId) return 'Transfer';
  return splitLabel(transaction) ?? transaction.category?.name ?? 'Unclassified';
}

/** "Groceries", "Transfer", "Split (n)" or "Unclassified", coloured so Transfer and Unclassified stand out. */
export function CategoryLabel({ transaction }: { transaction: TransactionListItem }) {
  if (transaction.transferId) {
    return <span className="text-sky-700 dark:text-sky-400">Transfer</span>;
  }
  if (transaction.category || transaction.splitLines.length > 0) {
    return <>{categoryText(transaction)}</>;
  }
  return <span className="text-amber-700 dark:text-amber-400">Unclassified</span>;
}

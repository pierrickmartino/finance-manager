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

type ClassificationKind = 'transfer' | 'split' | 'category' | 'unclassified';

function classificationKind(transaction: Classified): ClassificationKind {
  if (transaction.transferId) return 'transfer';
  if (transaction.splitLines.length > 0) return 'split';
  return transaction.category ? 'category' : 'unclassified';
}

/** "Groceries", "Transfer", "Split (n)" or "Unclassified" as plain text. */
export function categoryText(transaction: Classified): string {
  switch (classificationKind(transaction)) {
    case 'transfer':
      return 'Transfer';
    case 'split':
      return splitLabel(transaction) ?? 'Split';
    case 'category':
      return transaction.category?.name ?? 'Unclassified';
    case 'unclassified':
      return 'Unclassified';
  }
}

/** Colours that make Transfer and Unclassified stand out; other kinds stay plain. */
const KIND_CLASS: Partial<Record<ClassificationKind, string>> = {
  transfer: 'text-sky-700 dark:text-sky-400',
  unclassified: 'text-amber-700 dark:text-amber-400',
};

/**
 * "Groceries", "Transfer", "Split (n)" or "Unclassified", coloured so Transfer and Unclassified
 * stand out.
 */
export function CategoryLabel({ transaction }: { transaction: TransactionListItem }) {
  const className = KIND_CLASS[classificationKind(transaction)];
  const text = categoryText(transaction);
  return className ? <span className={className}>{text}</span> : <>{text}</>;
}

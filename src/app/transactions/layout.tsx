import type { ReactElement, ReactNode } from 'react';
import { TransactionMorphScope } from './transaction-morph';

/**
 * The Transactions list and its Transaction details share one morph scope (ADR-0012): it
 * outlives navigations between them, so stepping from one Transaction detail to another is
 * told apart from opening one from the list.
 */
export default function TransactionsLayout({ children }: { children: ReactNode }): ReactElement {
  return <TransactionMorphScope>{children}</TransactionMorphScope>;
}

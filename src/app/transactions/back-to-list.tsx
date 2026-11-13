'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { createRememberedValue } from '@/lib/remembered-value';

const LIST_HREF = '/transactions';

/*
 * The Transactions list the user last looked at (its search, page and selection), kept for the
 * session's client-side navigations only. A full page load starts again from the plain list.
 */
const lastList = createRememberedValue(LIST_HREF);

interface RememberTransactionsListProps {
  /** The list page's own URL: its search, page and selection. */
  href: string;
}

/** Records `href` as the list to go back to; renders nothing. Put it on the list page. */
export function RememberTransactionsList({ href }: RememberTransactionsListProps): null {
  useEffect(() => lastList.remember(href), [href]);
  return null;
}

/**
 * "← Transactions": back to the list the Transaction was opened from, as a navigation, so the
 * Transaction detail's header morphs back into its row or preview (ADR-0012). Browser back
 * lands on the same list, without the morph: React runs history traversals synchronously.
 */
export function BackToTransactions(): ReactElement {
  const href = useSyncExternalStore(lastList.subscribe, lastList.get, () => LIST_HREF);
  return (
    <Link href={href} className="text-sm text-muted hover:underline">
      ← Transactions
    </Link>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';

const LIST_HREF = '/transactions';

/*
 * The Transactions list the user last looked at (its search, page and selection), kept for the
 * session's client-side navigations only. A full page load starts again from the plain list.
 */
let lastListHref = LIST_HREF;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Records `href` as the list to go back to; renders nothing. Put it on the list page. */
export function RememberTransactionsList({ href }: { href: string }) {
  useEffect(() => {
    lastListHref = href;
    for (const listener of listeners) listener();
  }, [href]);
  return null;
}

/**
 * "← Transactions": back to the list the Transaction was opened from, as a navigation, so the
 * Transaction detail's header morphs back into its row or preview (ADR-0012). Browser back
 * lands on the same list, without the morph: React runs history traversals synchronously.
 */
export function BackToTransactions() {
  const href = useSyncExternalStore(
    subscribe,
    () => lastListHref,
    () => LIST_HREF,
  );
  return (
    <Link href={href} className="text-sm text-muted hover:underline">
      ← Transactions
    </Link>
  );
}

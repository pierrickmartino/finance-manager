import Link from 'next/link';
import type { ReactElement } from 'react';

interface BackToTransactionsProps {
  /** The list to return to, from `transactionsBackHref` (ADR-0013). */
  href: string;
}

/**
 * "← Transactions": back to the list the Transaction detail carries in its URL, at the page
 * holding the open Transaction, with it selected. It is a navigation, so the detail's header
 * morphs back into that row or the preview (ADR-0012). Browser back lands on the list the
 * user came from, without the morph: React runs history traversals synchronously.
 */
export function BackToTransactions({ href }: BackToTransactionsProps): ReactElement {
  return (
    <Link href={href} className="text-sm text-muted hover:underline">
      ← Transactions
    </Link>
  );
}

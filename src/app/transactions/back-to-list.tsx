import type { ReactElement } from 'react';
import { GuardedLink } from '@/components/unsaved-changes';

interface BackToTransactionsProps {
  /** The list to return to, from `transactionsBackHref` (ADR-0013). */
  href: string;
}

/**
 * "← Transactions": back to the list the Transaction detail carries in its URL, at the page
 * holding the open Transaction, with it selected. It is a navigation, so the detail's header
 * morphs back into that row or the preview (ADR-0012). Browser back lands on the list the
 * user came from, without the morph: React runs history traversals synchronously.
 * Asks before discarding unsaved edits on the Transaction detail.
 */
export function BackToTransactions({ href }: BackToTransactionsProps): ReactElement {
  return (
    <GuardedLink href={href} className="text-sm text-muted hover:underline">
      ← Transactions
    </GuardedLink>
  );
}

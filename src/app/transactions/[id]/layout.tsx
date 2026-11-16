import type { ReactElement, ReactNode } from 'react';
import { UnsavedChangesGuard } from '@/components/unsaved-changes';

/**
 * Every way off a Transaction detail asks before discarding its unsaved classification or
 * Split edits (spec #152, stories 27-31): Previous, Next, `j` / `k`, "← Transactions" and the
 * browser's reload or close.
 */
export default function TransactionLayout({ children }: { children: ReactNode }): ReactElement {
  return <UnsavedChangesGuard>{children}</UnsavedChangesGuard>;
}

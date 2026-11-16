import type { BulkEditInput, BulkFilter } from '@/server/services/transactions/bulk-edit';

/**
 * Which Transactions a Bulk edit applies to: picked by id, a whole Unclassified group, or every
 * Transaction a Transactions list filter matches ("Select all N matching this filter").
 */
export type BulkScope =
  { transactionIds: string[] } | { groupKey: string } | { filter: BulkFilter };

type ScopeInput = Pick<BulkEditInput, 'transactionIds' | 'groupKey' | 'filter'>;

/**
 * The scope as the service's input: only the scope's own field reaches the service, which
 * validates it. A filter wins over a group, a group over ids, if a client sends several.
 */
export function scopeInput(scope: BulkScope): ScopeInput {
  if ('filter' in scope) return { filter: scope.filter };
  return 'groupKey' in scope
    ? { groupKey: scope.groupKey }
    : { transactionIds: scope.transactionIds };
}

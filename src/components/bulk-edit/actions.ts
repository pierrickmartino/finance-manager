'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  bulkEditClassification,
  type BulkChanges,
  type BulkEditResult,
} from '@/server/services/transactions/bulk-edit';
import { scopeInput, type BulkScope } from './scope';

/**
 * The one Bulk edit action, shared by the Transactions list and the Unclassified page: applies
 * `changes` to the Transactions in `scope` and revalidates both pages.
 */
export async function bulkEditAction(
  scope: BulkScope,
  changes: BulkChanges,
): Promise<ActionResult<BulkEditResult>> {
  const result = await runAction(async () =>
    bulkEditClassification(await getServiceContext(), { ...scopeInput(scope), changes }),
  );
  if (result.ok) {
    revalidatePath('/transactions');
    revalidatePath('/unclassified');
  }
  return result;
}

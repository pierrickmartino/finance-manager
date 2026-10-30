'use server';

import { revalidatePath } from 'next/cache';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  bulkEditClassification,
  type BulkChanges,
  type BulkEditResult,
} from '@/server/services/transactions/bulk-edit';

/** Tag names typed as a comma-separated list. */
function readTags(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/** The fields the user filled in; blank fields are left as they are on each Transaction. */
function readChanges(formData: FormData): BulkChanges {
  const changes: BulkChanges = {};
  const payee = formText(formData, 'payee').trim();
  if (payee) changes.payeeName = payee;
  const categoryId = formText(formData, 'categoryId');
  if (categoryId) changes.categoryId = categoryId;
  const tags = readTags(formText(formData, 'tags'));
  if (tags.length > 0) changes.tagNames = tags;
  return changes;
}

/**
 * Bulk edit from the Unclassified view. The "scope" submit button says whether it applies to
 * the whole group (every member still Unclassified) or to the ticked Transactions.
 */
export async function bulkEditAction(
  groupKey: string,
  _previous: ActionResult<BulkEditResult> | null,
  formData: FormData,
): Promise<ActionResult<BulkEditResult>> {
  const changes = readChanges(formData);
  const selection =
    formData.get('scope') === 'group'
      ? { groupKey }
      : { transactionIds: formData.getAll('transactionId').map(String) };
  const result = await runAction(async () =>
    bulkEditClassification(await getServiceContext(), { ...selection, changes }),
  );
  if (result.ok) {
    revalidatePath('/unclassified');
    revalidatePath('/transactions');
  }
  return result;
}

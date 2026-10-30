'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { deleteImportedTransaction } from '@/server/services/imports';
import { deleteManualTransaction } from '@/server/services/transactions/manual';
import {
  editClassification,
  getClassification,
  unlockFields,
  type Classification,
  type ClassificationChanges,
  type ClassificationField,
} from '@/server/services/transactions';

const sameText = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Tag names typed as a comma-separated list. */
function readTags(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * The fields the form actually changed. Only those are sent, because every field sent is
 * locked against the Rules (spec 64).
 */
function changedFields(current: Classification, formData: FormData): ClassificationChanges {
  const changes: ClassificationChanges = {};
  const payee = formText(formData, 'payee').trim();
  if (!sameText(payee, current.payee?.name ?? '')) changes.payeeName = payee || null;

  const categoryId = formText(formData, 'categoryId');
  if (categoryId !== (current.category?.id ?? '')) changes.categoryId = categoryId || null;

  const tags = readTags(formText(formData, 'tags'));
  const currentTags = current.tags.map((tag) => tag.name.toLowerCase()).sort();
  const typedTags = [...new Set(tags.map((name) => name.toLowerCase()))].sort();
  if (JSON.stringify(currentTags) !== JSON.stringify(typedTags)) changes.tagNames = tags;

  const notes = formText(formData, 'notes').trim();
  if (notes !== (current.notes ?? '')) changes.notes = notes || null;
  return changes;
}

function revalidate(id: string): void {
  revalidatePath(`/transactions/${id}`);
  revalidatePath('/transactions');
}

export async function editClassificationAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    const changes = changedFields(await getClassification(ctx, id), formData);
    if (Object.keys(changes).length === 0) return null;
    return editClassification(ctx, id, changes);
  });
  if (result.ok) revalidate(id);
  return result;
}

export async function unlockFieldAction(
  id: string,
  field: ClassificationField,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => unlockFields(await getServiceContext(), id, [field]));
  if (result.ok) revalidate(id);
  return result;
}

/** Deletes a Transaction and goes back to the list (the detail page is gone). */
export async function deleteTransactionFromDetailAction(
  id: string,
  isManual: boolean,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    await (isManual ? deleteManualTransaction(ctx, id) : deleteImportedTransaction(ctx, id));
  });
  if (!result.ok) return result;
  revalidatePath('/transactions');
  revalidatePath('/accounts', 'layout');
  redirect('/transactions');
}

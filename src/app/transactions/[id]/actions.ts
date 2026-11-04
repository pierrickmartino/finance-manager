'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { parseAmount } from '@/lib/format/parse-amount';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { getRequestDisplaySettings } from '@/server/formatter';
import { parseInput, ValidationError } from '@/server/services/errors';
import { deleteImportedTransaction } from '@/server/services/imports';
import {
  linkTransfer,
  parseSideOptionValue,
  unlinkTransfer,
  type TransferSideRef,
} from '@/server/services/transfers';
import { deleteManualTransaction } from '@/server/services/transactions/manual';
import {
  editClassification,
  getClassification,
  getTransaction,
  removeSplit,
  splitTransaction,
  unlockFields,
  type SplitLineInput,
  type Classification,
  type ClassificationChanges,
  type ClassificationField,
} from '@/server/services/transactions';
import type { SplitLineDraft } from './split-lines';

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

/** The split form's `lines` field: one JSON object per line, as the form edits it. */
const splitDraftsInput = z.array(
  z.object({
    id: z.string().optional(),
    amount: z.string(),
    categoryId: z.string(),
    tags: z.string(),
    note: z.string(),
    isTransfer: z.literal(true).optional(),
  }),
  { error: 'The Split lines could not be read' },
);

function readSplitDrafts(formData: FormData): SplitLineDraft[] {
  try {
    return parseInput(splitDraftsInput, JSON.parse(formText(formData, 'lines')));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ValidationError('The Split lines could not be read');
    throw error;
  }
}

/** The split form's lines, with amounts read in the user's number format. */
async function readSplitLines(formData: FormData, currency: string): Promise<SplitLineInput[]> {
  const { numberFormat } = await getRequestDisplaySettings();
  return readSplitDrafts(formData).map((draft, index) => {
    const amountMinor = parseAmount(draft.amount, numberFormat, currency);
    if (amountMinor === null) {
      throw new ValidationError(`Line ${index + 1}: enter a valid amount`);
    }
    return {
      id: draft.id,
      amountMinor,
      // A Transfer line has no Category; the service refuses one on it anyway (ADR-0005).
      categoryId: draft.isTransfer ? null : draft.categoryId,
      tagNames: readTags(draft.tags),
      note: draft.note,
    };
  });
}

/** Splits the Transaction into the form's lines, replacing any Split it has (ADR-0004). */
export async function splitTransactionAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    const { currency } = await getTransaction(ctx, id);
    return splitTransaction(ctx, id, await readSplitLines(formData, currency));
  });
  if (result.ok) {
    revalidate(id);
    revalidatePath('/unclassified');
  }
  return result;
}

/** Removes the Transaction's Split: it is Unclassified again. */
export async function removeSplitAction(
  id: string,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => removeSplit(await getServiceContext(), id));
  if (result.ok) {
    revalidate(id);
    revalidatePath('/unclassified');
  }
  return result;
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

/**
 * Links a side on this Transaction's page (the Transaction itself or one of its Split lines)
 * with the chosen side, `kind:id`, as a Transfer (spec 88, ADR-0005). The service checks both.
 */
export async function linkTransferAction(
  id: string,
  side: TransferSideRef,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => {
    const other = parseSideOptionValue(formText(formData, 'otherSide'));
    return linkTransfer(await getServiceContext(), { sides: [side, other] });
  });
  if (result.ok) {
    revalidate(id);
    revalidatePath('/unclassified');
  }
  return result;
}

/**
 * Unlinks the Transfer a side on this Transaction's page (the Transaction itself or one of its
 * Split lines) is in; both sides stay.
 */
export async function unlinkTransferAction(
  id: string,
  side: TransferSideRef,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => unlinkTransfer(await getServiceContext(), side));
  if (result.ok) {
    revalidate(id);
    revalidatePath('/unclassified');
  }
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

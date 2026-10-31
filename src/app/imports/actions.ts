'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { ValidationError } from '@/server/services/errors';
import {
  commitImport,
  deleteImportedTransaction,
  discardImport,
  previewImport,
  undoImport,
} from '@/server/services/imports';
import { readNearDuplicateDecisions } from './near-duplicate-decisions';
import { readTransferDecisions } from './transfer-decisions';

/** Uploads a bank file into an Account and opens its preview. Nothing is saved yet. */
export async function previewImportAction(
  accountId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose a file to import');
    }
    return previewImport(await getServiceContext(), {
      accountId,
      fileName: file.name,
      content: new Uint8Array(await file.arrayBuffer()),
    });
  });
  if (!result.ok) return result;
  redirect(`/imports/${result.data.id}`);
}

export async function commitImportAction(
  previewId: string,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    commitImport(await getServiceContext(), {
      previewId,
      acceptOpeningBalance: formText(formData, 'acceptOpeningBalance') === 'on',
      nearDuplicateDecisions: readNearDuplicateDecisions(formData),
      transferDecisions: readTransferDecisions(formData),
    }),
  );
  if (!result.ok) return result;
  revalidatePath('/accounts', 'layout');
  redirect(`/accounts/${result.data.accountId}`);
}

export async function discardImportAction(
  previewId: string,
  accountId: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const result = await runAction(async () => discardImport(await getServiceContext(), previewId));
  if (!result.ok) return result;
  redirect(`/accounts/${accountId}`);
}

/** Undoes a whole Import: its Transactions are deleted and it is marked undone. */
export async function undoImportAction(
  importId: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    await undoImport(await getServiceContext(), importId);
  });
  if (result.ok) revalidatePath('/accounts', 'layout');
  return result;
}

/** Deletes one imported Transaction, for a bank error, keeping the rest of its Import. */
export async function deleteImportedTransactionAction(
  transactionId: string,
  _previous: ActionResult | null,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    deleteImportedTransaction(await getServiceContext(), transactionId),
  );
  if (result.ok) revalidatePath('/accounts', 'layout');
  return result;
}

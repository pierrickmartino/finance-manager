'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { ValidationError } from '@/server/services/errors';
import { commitImport, discardImport, previewImport } from '@/server/services/imports';

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

'use server';

import { revalidatePath } from 'next/cache';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { createBank, type Bank } from '@/server/services/banks';

export async function createBankAction(
  _previous: ActionResult<Bank> | null,
  formData: FormData,
): Promise<ActionResult<Bank>> {
  const result = await runAction(async () =>
    createBank(await getServiceContext(), { name: formText(formData, 'name') }),
  );
  if (result.ok) revalidatePath('/banks');
  return result;
}

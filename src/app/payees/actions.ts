'use server';

import { revalidatePath } from 'next/cache';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { createPayee, deletePayee, mergePayees, renamePayee } from '@/server/services/payees';

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) {
    revalidatePath('/payees');
    revalidatePath('/transactions', 'layout');
  }
  return result;
}

export async function createPayeeAction(
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => createPayee(await getServiceContext(), formText(formData, 'name')));
}

export async function renamePayeeAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => renamePayee(await getServiceContext(), id, formText(formData, 'name')));
}

export async function mergePayeeAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () =>
    mergePayees(await getServiceContext(), id, formText(formData, 'targetId')),
  );
}

export async function deletePayeeAction(
  id: string,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  return run(async () => deletePayee(await getServiceContext(), id));
}

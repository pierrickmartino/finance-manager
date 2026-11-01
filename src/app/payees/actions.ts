'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

/** Creates a Payee and opens it. */
export async function createPayeeAction(
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const result = await run(async () =>
    createPayee(await getServiceContext(), formText(formData, 'name')),
  );
  if (!result.ok) return result;
  redirect(`/payees?payee=${result.data.id}`);
}

export async function renamePayeeAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => renamePayee(await getServiceContext(), id, formText(formData, 'name')));
}

/** Merges a Payee into another and opens that one: the merged Payee no longer exists. */
export async function mergePayeeAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const targetId = formText(formData, 'targetId');
  const result = await run(async () => mergePayees(await getServiceContext(), id, targetId));
  if (!result.ok) return result;
  redirect(`/payees?payee=${targetId}`);
}

export async function deletePayeeAction(
  id: string,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  return run(async () => deletePayee(await getServiceContext(), id));
}

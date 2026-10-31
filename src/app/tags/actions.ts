'use server';

import { revalidatePath } from 'next/cache';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { createTag, deleteTag, mergeTags, renameTag } from '@/server/services/tags';

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) {
    revalidatePath('/tags');
    revalidatePath('/transactions', 'layout');
  }
  return result;
}

export async function createTagAction(
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => createTag(await getServiceContext(), formText(formData, 'name')));
}

export async function renameTagAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => renameTag(await getServiceContext(), id, formText(formData, 'name')));
}

export async function mergeTagAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => mergeTags(await getServiceContext(), id, formText(formData, 'targetId')));
}

export async function deleteTagAction(
  id: string,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  return run(async () => deleteTag(await getServiceContext(), id));
}

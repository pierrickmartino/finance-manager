'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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

/** Creates a Tag and opens it. */
export async function createTagAction(
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const result = await run(async () =>
    createTag(await getServiceContext(), formText(formData, 'name')),
  );
  if (!result.ok) return result;
  redirect(`/tags?tag=${result.data.id}`);
}

export async function renameTagAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return run(async () => renameTag(await getServiceContext(), id, formText(formData, 'name')));
}

/** Merges a Tag into another and opens that one: the merged Tag no longer exists. */
export async function mergeTagAction(
  id: string,
  _previous: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  const targetId = formText(formData, 'targetId');
  const result = await run(async () => mergeTags(await getServiceContext(), id, targetId));
  if (!result.ok) return result;
  redirect(`/tags?tag=${targetId}`);
}

export async function deleteTagAction(
  id: string,
  _previous: ActionResult<unknown> | null,
): Promise<ActionResult<unknown>> {
  return run(async () => deleteTag(await getServiceContext(), id));
}

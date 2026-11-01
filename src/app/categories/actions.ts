'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  listCategoryGroups,
  mergeCategory,
  moveCategory,
  renameCategory,
  reorderCategories,
  reorderCategoryGroups,
  updateCategoryGroup,
  type CategoryGroupType,
} from '@/server/services/categories';
import { shifted, shiftedAmongKind } from './order';

type Result = ActionResult<unknown>;

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) {
    revalidatePath('/categories');
    revalidatePath('/transactions', 'layout');
  }
  return result;
}

/** Creates a group and opens it, so its first Categories can be added straight away. */
export async function createGroupAction(_previous: Result | null, formData: FormData) {
  const result = await run(async () =>
    createCategoryGroup(await getServiceContext(), {
      name: formText(formData, 'name'),
      type: formText(formData, 'type') as CategoryGroupType,
    }),
  );
  if (!result.ok) return result;
  redirect(`/categories?group=${result.data.id}`);
}

export async function updateGroupAction(id: string, _previous: Result | null, formData: FormData) {
  return run(async () =>
    updateCategoryGroup(await getServiceContext(), id, {
      name: formText(formData, 'name'),
      type: formText(formData, 'type') as CategoryGroupType,
    }),
  );
}

export async function deleteGroupAction(id: string, _previous: Result | null) {
  return run(async () => deleteCategoryGroup(await getServiceContext(), id));
}

export async function shiftGroupAction(id: string, delta: -1 | 1, _previous: Result | null) {
  return run(async () => {
    const ctx = await getServiceContext();
    // The page lists groups sectioned by type, so a group moves past its own type's neighbours.
    const groups = (await listCategoryGroups(ctx)).map((group) => ({
      id: group.id,
      kind: group.type,
    }));
    await reorderCategoryGroups(ctx, shiftedAmongKind(groups, id, delta));
  });
}

export async function createCategoryAction(
  groupId: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () =>
    createCategory(await getServiceContext(), { groupId, name: formText(formData, 'name') }),
  );
}

export async function renameCategoryAction(
  id: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () => renameCategory(await getServiceContext(), id, formText(formData, 'name')));
}

export async function moveCategoryAction(id: string, _previous: Result | null, formData: FormData) {
  return run(async () =>
    moveCategory(await getServiceContext(), id, formText(formData, 'groupId')),
  );
}

export async function mergeCategoryAction(
  id: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () =>
    mergeCategory(await getServiceContext(), id, formText(formData, 'targetId')),
  );
}

export async function deleteCategoryAction(id: string, _previous: Result | null) {
  return run(async () => deleteCategory(await getServiceContext(), id));
}

export async function shiftCategoryAction(
  groupId: string,
  id: string,
  delta: -1 | 1,
  _previous: Result | null,
) {
  return run(async () => {
    const ctx = await getServiceContext();
    const group = (await listCategoryGroups(ctx)).find((candidate) => candidate.id === groupId);
    const ids = group?.categories.map((category) => category.id) ?? [];
    await reorderCategories(ctx, groupId, shifted(ids, id, delta));
  });
}

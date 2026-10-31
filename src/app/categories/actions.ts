'use server';

import { revalidatePath } from 'next/cache';
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

type Result = ActionResult<unknown>;

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) {
    revalidatePath('/categories');
    revalidatePath('/transactions', 'layout');
  }
  return result;
}

/** `ids` with `id` moved one place up (-1) or down (+1). */
function shifted(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const order = [...ids];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}

export async function createGroupAction(_previous: Result | null, formData: FormData) {
  return run(async () =>
    createCategoryGroup(await getServiceContext(), {
      name: formText(formData, 'name'),
      type: formText(formData, 'type') as CategoryGroupType,
    }),
  );
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
    const ids = (await listCategoryGroups(ctx)).map((group) => group.id);
    await reorderCategoryGroups(ctx, shifted(ids, id, delta));
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

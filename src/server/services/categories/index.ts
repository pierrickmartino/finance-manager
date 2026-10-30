import { z } from 'zod';
import type pg from 'pg';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import {
  ConflictError,
  isUniqueViolation,
  parseInput,
  ValidationError,
} from '../errors';
import {
  CATEGORY_GROUP_TYPES,
  CATEGORY_ORDER,
  categorySnapshot,
  findCategory,
  findGroup,
  GROUP_ORDER,
  groupSnapshot,
  MAX_NAME_LENGTH,
  SELECT_CATEGORY,
  SELECT_GROUP,
  type Category,
  type CategoryGroup,
} from './model';

export {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  type Category,
  type CategoryGroup,
  type CategoryGroupType,
} from './model';
export { seedStarterCategories } from './seed';

const name = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} name is required`)
    .max(MAX_NAME_LENGTH, `${what} name must be at most ${MAX_NAME_LENGTH} characters`);

const groupInput = z.object({
  name: name('Category group'),
  type: z.enum(CATEGORY_GROUP_TYPES, { error: 'Type must be Income, Expense or Capital' }),
});
export type CategoryGroupInput = z.input<typeof groupInput>;

const categoryInput = z.object({ groupId: z.string(), name: name('Category') });
export type CategoryInput = z.input<typeof categoryInput>;

const idList = z.array(z.string(), { error: 'Give the new order as a list of ids' });

type Group = Omit<CategoryGroup, 'categories'>;

/** Runs a write that may hit a name uniqueness constraint, mapping it to a user message. */
async function uniqueName<T>(write: () => Promise<T>, label: string): Promise<T> {
  try {
    return await write();
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'category_group_name_unique')) {
      throw new ConflictError(`A Category group named "${label}" already exists`);
    }
    if (isUniqueViolation(error, 'category_name_unique')) {
      throw new ConflictError(`This group already has a Category named "${label}"`);
    }
    throw error;
  }
}

/** Every Category group in its order, each with its Categories in their order. */
export async function listCategoryGroups(ctx: ServiceContext): Promise<CategoryGroup[]> {
  const [groups, categories] = await Promise.all([
    ctx.db.query<Group>(`${SELECT_GROUP} ORDER BY ${GROUP_ORDER}`),
    ctx.db.query<Category>(`${SELECT_CATEGORY} ORDER BY ${CATEGORY_ORDER}`),
  ]);
  return groups.rows.map((group) => ({
    ...group,
    categories: categories.rows.filter((category) => category.groupId === group.id),
  }));
}

export async function getCategory(ctx: ServiceContext, id: string): Promise<Category> {
  return findCategory(ctx.db, id);
}

/** Inserts a Category group at the end, inside an open mutation (used by the seed too). */
export async function insertCategoryGroup(
  { tx, history }: MutationScope,
  input: { name: string; type: Group['type'] },
): Promise<Group> {
  const inserted = await uniqueName(
    () =>
      tx.query<{ id: string }>(
        `INSERT INTO category_group (name, type, sort)
         VALUES ($1, $2, (SELECT coalesce(max(sort) + 1, 0) FROM category_group))
         RETURNING id`,
        [input.name, input.type],
      ),
    input.name,
  );
  const group = await findGroup(tx, inserted.rows[0]!.id);
  await history.record('category_group', group.id, null, groupSnapshot(group));
  return group;
}

/** Inserts a Category at the end of its group, inside an open mutation. */
export async function insertCategory(
  { tx, history }: MutationScope,
  input: { groupId: string; name: string },
): Promise<Category> {
  await findGroup(tx, input.groupId, true);
  const inserted = await uniqueName(
    () =>
      tx.query<{ id: string }>(
        `INSERT INTO category (group_id, name, sort)
         VALUES ($1, $2, (SELECT coalesce(max(sort) + 1, 0) FROM category WHERE group_id = $1))
         RETURNING id`,
        [input.groupId, input.name],
      ),
    input.name,
  );
  const category = await findCategory(tx, inserted.rows[0]!.id);
  await history.record('category', category.id, null, categorySnapshot(category));
  return category;
}

export async function createCategoryGroup(
  ctx: ServiceContext,
  input: CategoryGroupInput,
): Promise<CategoryGroup> {
  const values = parseInput(groupInput, input);
  const group = await mutate(ctx, (scope) => insertCategoryGroup(scope, values));
  return { ...group, categories: [] };
}

/** Renames a Category group or changes its type; its Categories follow (reporting). */
export async function updateCategoryGroup(
  ctx: ServiceContext,
  id: string,
  input: CategoryGroupInput,
): Promise<Group> {
  const values = parseInput(groupInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findGroup(tx, id, true);
    await uniqueName(
      () =>
        tx.query('UPDATE category_group SET name = $1, type = $2 WHERE id = $3', [
          values.name,
          values.type,
          id,
        ]),
      values.name,
    );
    const after = await findGroup(tx, id);
    await history.record('category_group', id, groupSnapshot(before), groupSnapshot(after));
    return after;
  });
}

/** Deletes a Category group that has no Categories left. */
export async function deleteCategoryGroup(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }) => {
    const group = await findGroup(tx, id, true);
    const members = await tx.query('SELECT 1 FROM category WHERE group_id = $1 LIMIT 1', [id]);
    if (members.rowCount) {
      throw new ConflictError(
        `"${group.name}" still has Categories: move or delete them first`,
      );
    }
    await tx.query('DELETE FROM category_group WHERE id = $1', [id]);
    await history.record('category_group', id, groupSnapshot(group), null);
  });
}

/** Checks that `ids` lists every current member exactly once. */
function checkOrder(ids: readonly string[], current: readonly string[]): void {
  const wanted = new Set(ids);
  const isComplete =
    wanted.size === ids.length &&
    ids.length === current.length &&
    current.every((id) => wanted.has(id));
  if (!isComplete) {
    throw new ValidationError('The new order must list every item exactly once');
  }
}

/** Gives each row its position in `ids` as its sort, recording the changes. */
async function applyOrder(
  tx: pg.PoolClient,
  table: 'category' | 'category_group',
  ids: readonly string[],
): Promise<void> {
  await tx.query(
    `UPDATE ${table} SET sort = o.n - 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, n)
     WHERE ${table}.id = o.id`,
    [ids],
  );
}

/** Puts the Category groups in the given order. `ids` must list every group once. */
export async function reorderCategoryGroups(
  ctx: ServiceContext,
  ids: readonly string[],
): Promise<void> {
  const order = parseInput(idList, ids);
  await mutate(ctx, async ({ tx, history }) => {
    const before = await tx.query<Group>(`${SELECT_GROUP} ORDER BY ${GROUP_ORDER} FOR UPDATE`);
    checkOrder(order, before.rows.map((group) => group.id));
    await applyOrder(tx, 'category_group', order);
    for (const group of before.rows) {
      const after = { ...group, sort: order.indexOf(group.id) };
      await history.record('category_group', group.id, groupSnapshot(group), groupSnapshot(after));
    }
  });
}

/** Puts a group's Categories in the given order. `ids` must list every Category of it once. */
export async function reorderCategories(
  ctx: ServiceContext,
  groupId: string,
  ids: readonly string[],
): Promise<void> {
  const order = parseInput(idList, ids);
  await mutate(ctx, async ({ tx, history }) => {
    await findGroup(tx, groupId, true);
    const before = await tx.query<Category>(
      `${SELECT_CATEGORY} WHERE c.group_id = $1 ORDER BY ${CATEGORY_ORDER} FOR UPDATE OF c`,
      [groupId],
    );
    checkOrder(order, before.rows.map((category) => category.id));
    await applyOrder(tx, 'category', order);
    for (const category of before.rows) {
      const after = { ...category, sort: order.indexOf(category.id) };
      await history.record(
        'category',
        category.id,
        categorySnapshot(category),
        categorySnapshot(after),
      );
    }
  });
}

export async function createCategory(
  ctx: ServiceContext,
  input: CategoryInput,
): Promise<Category> {
  const values = parseInput(categoryInput, input);
  return mutate(ctx, (scope) => insertCategory(scope, values));
}

export async function renameCategory(
  ctx: ServiceContext,
  id: string,
  newName: string,
): Promise<Category> {
  const value = parseInput(name('Category'), newName);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findCategory(tx, id, true);
    await uniqueName(
      () => tx.query('UPDATE category SET name = $1 WHERE id = $2', [value, id]),
      value,
    );
    const after = await findCategory(tx, id);
    await history.record('category', id, categorySnapshot(before), categorySnapshot(after));
    return after;
  });
}

/**
 * Moves a Category to the end of another group. Its Transactions keep it, so they now report
 * under the new group and its type (spec 55).
 */
export async function moveCategory(
  ctx: ServiceContext,
  id: string,
  groupId: string,
): Promise<Category> {
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findCategory(tx, id, true);
    if (before.groupId === groupId) return before;
    await findGroup(tx, groupId, true);
    await uniqueName(
      () =>
        tx.query(
          `UPDATE category SET group_id = $1,
             sort = (SELECT coalesce(max(sort) + 1, 0) FROM category WHERE group_id = $1)
           WHERE id = $2`,
          [groupId, id],
        ),
      before.name,
    );
    const after = await findCategory(tx, id);
    await history.record('category', id, categorySnapshot(before), categorySnapshot(after));
    return after;
  });
}

/** Deletes a Category no Transaction uses. "Merge into…" empties one first (spec 56). */
export async function deleteCategory(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }) => {
    const category = await findCategory(tx, id, true);
    if (category.transactionCount > 0) {
      throw new ConflictError(
        `"${category.name}" still has ${category.transactionCount} Transactions: merge it into another Category instead`,
      );
    }
    await tx.query('DELETE FROM category WHERE id = $1', [id]);
    await history.record('category', id, categorySnapshot(category), null);
  });
}


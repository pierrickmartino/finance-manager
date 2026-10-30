import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { NotFoundError } from '../errors';
import type { HistorySnapshot } from '../history';

export const CATEGORY_GROUP_TYPES = ['income', 'expense', 'capital'] as const;
export type CategoryGroupType = (typeof CATEGORY_GROUP_TYPES)[number];

export const CATEGORY_GROUP_TYPE_LABELS: Record<CategoryGroupType, string> = {
  income: 'Income',
  expense: 'Expense',
  capital: 'Capital',
};

export interface Category {
  id: string;
  groupId: string;
  groupName: string;
  groupType: CategoryGroupType;
  name: string;
  sort: number;
  /** How many Transactions have this Category. */
  transactionCount: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  type: CategoryGroupType;
  sort: number;
  /** The group's Categories, in their order. */
  categories: Category[];
}

export const MAX_NAME_LENGTH = 100;

export const uuid = z.uuid();

export const SELECT_CATEGORY = `
  SELECT c.id, c.group_id AS "groupId", g.name AS "groupName", g.type AS "groupType", c.name,
         c.sort,
         (SELECT count(*)::int FROM "transaction" t WHERE t.category_id = c.id)
           AS "transactionCount"
  FROM category c
  JOIN category_group g ON g.id = c.group_id`;

export const SELECT_GROUP = `SELECT g.id, g.name, g.type, g.sort FROM category_group g`;

export const GROUP_ORDER = 'g.sort, lower(g.name), g.id';
export const CATEGORY_ORDER = 'c.sort, lower(c.name), c.id';

export function categorySnapshot(category: Category): HistorySnapshot {
  return { groupId: category.groupId, name: category.name, sort: category.sort };
}

export function groupSnapshot(group: Omit<CategoryGroup, 'categories'>): HistorySnapshot {
  return { name: group.name, type: group.type, sort: group.sort };
}

export async function findCategory(db: Queryable, id: string, lock = false): Promise<Category> {
  const notFound = new NotFoundError('Category not found');
  if (!uuid.safeParse(id).success) throw notFound;
  const result = await db.query<Category>(
    `${SELECT_CATEGORY} WHERE c.id = $1${lock ? ' FOR UPDATE OF c' : ''}`,
    [id],
  );
  const category = result.rows[0];
  if (!category) throw notFound;
  return category;
}

export async function findGroup(
  db: Queryable,
  id: string,
  lock = false,
): Promise<Omit<CategoryGroup, 'categories'>> {
  const notFound = new NotFoundError('Category group not found');
  if (!uuid.safeParse(id).success) throw notFound;
  const result = await db.query<Omit<CategoryGroup, 'categories'>>(
    `${SELECT_GROUP} WHERE g.id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  const group = result.rows[0];
  if (!group) throw notFound;
  return group;
}

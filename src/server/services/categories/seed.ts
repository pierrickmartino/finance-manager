import { mutate, type ServiceContext } from '../context';
import { insertCategory, insertCategoryGroup } from '.';
import type { CategoryGroupType } from './model';

/** The editable starter set (spec 53, 57, 51), in display order. */
export const STARTER_CATEGORIES: ReadonlyArray<{
  name: string;
  type: CategoryGroupType;
  categories: readonly string[];
}> = [
  {
    name: 'Income',
    type: 'income',
    categories: ['Salary', 'Bonus', 'Interest and dividends', 'Refunds', 'Other income'],
  },
  {
    name: 'Housing',
    type: 'expense',
    categories: ['Rent', 'Utilities', 'Household insurance', 'Maintenance'],
  },
  {
    name: 'Food',
    type: 'expense',
    categories: ['Groceries', 'Restaurants'],
  },
  {
    name: 'Transport',
    type: 'expense',
    categories: ['Public transport', 'Car', 'Fuel'],
  },
  {
    name: 'Health',
    type: 'expense',
    categories: ['Health insurance', 'Medical'],
  },
  {
    name: 'Daily life',
    type: 'expense',
    categories: ['Clothing', 'Leisure', 'Holidays', 'Gifts', 'Subscriptions'],
  },
  {
    name: 'Taxes and fees',
    type: 'expense',
    categories: ['Taxes', 'Bank fees'],
  },
  {
    name: 'Other expenses',
    type: 'expense',
    categories: ['Credit card (unitemised)', 'Cash withdrawal', 'Miscellaneous'],
  },
  {
    name: 'Capital',
    type: 'capital',
    categories: ['Property', 'Notary', 'Pension buy-in', 'EPL repayment'],
  },
];

const SEED_NAME = 'starter_categories';

/**
 * Seeds the starter Category groups and Categories on first run. Idempotent: it runs once per
 * database, ever, so a user who deletes the starter set doesn't get it back. Returns whether
 * it seeded. Written by the system actor, as one Batch.
 */
export async function seedStarterCategories(ctx: ServiceContext): Promise<boolean> {
  return mutate({ ...ctx, actor: { type: 'system', id: null } }, async (scope) => {
    const claimed = await scope.tx.query(
      `INSERT INTO first_run_seed (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [SEED_NAME],
    );
    if (claimed.rowCount === 0) return false;
    for (const starter of STARTER_CATEGORIES) {
      const group = await insertCategoryGroup(scope, starter);
      for (const name of starter.categories) {
        await insertCategory(scope, { groupId: group.id, name });
      }
    }
    await scope.history.summarize('Seeded the starter Categories');
    return true;
  });
}

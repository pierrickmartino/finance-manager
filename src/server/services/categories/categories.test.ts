import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { getBatchSummaries, listHistory } from '../history';
import { listTransactions } from '../transactions';
import { editClassification, getClassification } from '../transactions/classification';
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
  seedStarterCategories,
  updateCategoryGroup,
} from '.';

const t = setupTestDatabase();

const shape = async () =>
  (await listCategoryGroups(t.ctx)).map((group) => [
    group.name,
    group.type,
    group.categories.map((category) => category.name),
  ]);

describe('starter Categories', () => {
  it('are seeded once, with the credit card and Capital examples', async () => {
    expect(await seedStarterCategories(t.ctx)).toBe(true);

    const groups = await listCategoryGroups(t.ctx);
    const names = groups.flatMap((group) => group.categories.map((category) => category.name));
    expect(names).toContain('Credit card (unitemised)');
    const capital = groups.filter((group) => group.type === 'capital');
    expect(capital.flatMap((group) => group.categories.map((c) => c.name))).toEqual(
      expect.arrayContaining(['Property', 'Notary', 'Pension buy-in', 'EPL repayment']),
    );
    expect(groups.map((group) => group.type)).toEqual(
      expect.arrayContaining(['income', 'expense', 'capital']),
    );
    expect(
      await listHistory(t.ctx, { entityType: 'category_group', actorType: 'system' }),
    ).not.toHaveLength(0);
  });

  it('seeding again changes nothing, even after the user edited or emptied the set', async () => {
    await seedStarterCategories(t.ctx);
    const before = await shape();

    expect(await seedStarterCategories(t.ctx)).toBe(false);
    expect(await shape()).toEqual(before);

    for (const group of await listCategoryGroups(t.ctx)) {
      for (const category of group.categories) await deleteCategory(t.ctx, category.id);
      await deleteCategoryGroup(t.ctx, group.id);
    }
    expect(await seedStarterCategories(t.ctx)).toBe(false);
    expect(await listCategoryGroups(t.ctx)).toEqual([]);
  });

  it('two concurrent first runs seed one set', async () => {
    const results = await Promise.all([seedStarterCategories(t.ctx), seedStarterCategories(t.ctx)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const names = (await listCategoryGroups(t.ctx)).map((group) => group.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Category groups and Categories', () => {
  it('are created, renamed and listed in their order', async () => {
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
    const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
    await createCategory(t.ctx, { groupId: food.id, name: 'Restaurants' });
    await renameCategory(t.ctx, groceries.id, 'Supermarket');
    await updateCategoryGroup(t.ctx, income.id, { name: 'Earnings', type: 'income' });

    expect(await shape()).toEqual([
      ['Food', 'expense', ['Supermarket', 'Restaurants']],
      ['Earnings', 'income', []],
    ]);
    expect(await listHistory(t.ctx, { entityId: groceries.id })).toMatchObject([
      { field: 'name', before: 'Groceries', after: 'Supermarket' },
      { field: 'sort', before: null },
      { field: 'name', before: null, after: 'Groceries' },
      { field: 'groupId', before: null, after: food.id },
    ]);
  });

  it('are reordered', async () => {
    const a = await createCategoryGroup(t.ctx, { name: 'A', type: 'expense' });
    const b = await createCategoryGroup(t.ctx, { name: 'B', type: 'expense' });
    const one = await createCategory(t.ctx, { groupId: a.id, name: 'One' });
    const two = await createCategory(t.ctx, { groupId: a.id, name: 'Two' });

    await reorderCategoryGroups(t.ctx, [b.id, a.id]);
    await reorderCategories(t.ctx, a.id, [two.id, one.id]);

    expect(await shape()).toEqual([
      ['B', 'expense', []],
      ['A', 'expense', ['Two', 'One']],
    ]);
  });

  it('refuses a reorder that does not list exactly the current members', async () => {
    const a = await createCategoryGroup(t.ctx, { name: 'A', type: 'expense' });
    await createCategoryGroup(t.ctx, { name: 'B', type: 'expense' });
    const one = await createCategory(t.ctx, { groupId: a.id, name: 'One' });

    await expect(reorderCategoryGroups(t.ctx, [a.id])).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(reorderCategories(t.ctx, a.id, [one.id, one.id])).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('refuses duplicate names, ignoring case, and blank names', async () => {
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });

    await expect(
      createCategoryGroup(t.ctx, { name: 'food', type: 'income' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      createCategory(t.ctx, { groupId: food.id, name: 'GROCERIES' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(createCategory(t.ctx, { groupId: food.id, name: '  ' })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(
      createCategoryGroup(t.ctx, { name: 'X', type: 'savings' as 'income' }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('moves a Category to another group, at its end', async () => {
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const home = await createCategoryGroup(t.ctx, { name: 'Home', type: 'capital' });
    await createCategory(t.ctx, { groupId: home.id, name: 'Notary' });
    const property = await createCategory(t.ctx, { groupId: food.id, name: 'Property' });

    const moved = await moveCategory(t.ctx, property.id, home.id);

    expect(moved).toMatchObject({ groupId: home.id, groupType: 'capital', groupName: 'Home' });
    expect(await shape()).toEqual([
      ['Food', 'expense', []],
      ['Home', 'capital', ['Notary', 'Property']],
    ]);
    expect((await listHistory(t.ctx, { entityId: property.id })).slice(0, 2)).toMatchObject([
      { field: 'sort', before: 0, after: 1 },
      { field: 'groupId', before: food.id, after: home.id },
    ]);
  });

  it('deletes an empty group, and refuses one that still has Categories', async () => {
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const empty = await createCategoryGroup(t.ctx, { name: 'Empty', type: 'expense' });
    await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });

    await expect(deleteCategoryGroup(t.ctx, food.id)).rejects.toMatchObject({ code: 'conflict' });
    await deleteCategoryGroup(t.ctx, empty.id);

    expect((await listCategoryGroups(t.ctx)).map((group) => group.name)).toEqual(['Food']);
    expect((await listHistory(t.ctx, { entityId: empty.id }))[0]).toMatchObject({
      before: expect.anything(),
      after: null,
    });
  });

  it('reports unknown ids as not found', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(renameCategory(t.ctx, missing, 'X')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(renameCategory(t.ctx, 'nope', 'X')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(createCategory(t.ctx, { groupId: missing, name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

async function transactions(count: number): Promise<string[]> {
  const bank = await createBank(t.ctx, { name: 'UBS' });
  const account = await createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
  return seedTransactions(
    t.ctx.db,
    account,
    Array.from({ length: count }, (_, n) => ({
      bookingDate: '2025-10-01',
      amountMinor: -100 * (n + 1),
    })),
  );
}

describe('Categories with Transactions', () => {
  it('refuses to delete a Category that still has Transactions', async () => {
    const [id] = await transactions(1);
    const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const groceries = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
    await editClassification(t.ctx, id!, { categoryId: groceries.id });

    await expect(deleteCategory(t.ctx, groceries.id)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect((await getClassification(t.ctx, id!)).category?.id).toBe(groceries.id);
  });

  it('a merge reassigns the Transactions, deletes the source and writes one Batch', async () => {
    const [a, b, c] = await transactions(3);
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const shops = await createCategory(t.ctx, { groupId: food.id, name: 'Shops' });
    const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
    await editClassification(t.ctx, a!, { categoryId: shops.id });
    await editClassification(t.ctx, b!, { categoryId: shops.id });
    await editClassification(t.ctx, c!, { categoryId: groceries.id });

    const result = await mergeCategory(t.ctx, shops.id, groceries.id);

    expect(result.transactionCount).toBe(2);
    expect((await listTransactions(t.ctx, { categoryId: groceries.id })).total).toBe(3);
    expect((await listCategoryGroups(t.ctx))[0]!.categories).toMatchObject([
      { name: 'Groceries', transactionCount: 3 },
    ]);
    const batch = await listHistory(t.ctx, { batchId: result.batchId });
    expect(batch.filter((entry) => entry.entityType === 'transaction')).toMatchObject([
      { field: 'category', before: 'Food › Shops', after: 'Food › Groceries' },
      { field: 'category', before: 'Food › Shops', after: 'Food › Groceries' },
    ]);
    expect(batch.filter((entry) => entry.entityType === 'category')).toMatchObject([
      { entityId: shops.id, after: null },
      { entityId: shops.id, after: null },
      { entityId: shops.id, after: null },
    ]);
    expect(await getBatchSummaries(t.ctx, [result.batchId])).toEqual({
      [result.batchId]: 'Merged Category "Food › Shops" into "Food › Groceries" (2 Transactions)',
    });
    await expect(mergeCategory(t.ctx, groceries.id, groceries.id)).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('moving a Category changes the group type its Transactions report under', async () => {
    const [id] = await transactions(1);
    const expense = await createCategoryGroup(t.ctx, { name: 'Home', type: 'expense' });
    const capital = await createCategoryGroup(t.ctx, { name: 'Wealth', type: 'capital' });
    const notary = await createCategory(t.ctx, { groupId: expense.id, name: 'Notary' });
    await editClassification(t.ctx, id!, { categoryId: notary.id });
    expect((await listTransactions(t.ctx, { groupType: 'expense' })).total).toBe(1);

    await moveCategory(t.ctx, notary.id, capital.id);

    expect((await listTransactions(t.ctx, { groupType: 'expense' })).total).toBe(0);
    expect(
      (await listTransactions(t.ctx, { groupType: 'capital' })).transactions.map((tx) => tx.id),
    ).toEqual([id]);
    expect((await getClassification(t.ctx, id!)).category).toMatchObject({
      id: notary.id,
      groupType: 'capital',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getBatchSummaries, listHistory } from '../history';
import { createRule } from '../rules';
import { applyRulesToExisting } from '../rules/existing';
import { createTag, listTags } from '../tags';
import { bulkEditClassification } from './bulk-edit';
import { editClassification, getClassification } from './classification';
import { splitTransaction } from './split';

const t = setupTestDatabase();

async function seed(...descriptions: string[]): Promise<string[]> {
  const bank = await createBank(t.ctx, { name: `Bank ${Math.random()}` });
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
    descriptions.map((rawDescription) => ({
      bookingDate: '2025-10-03',
      amountMinor: -1000,
      rawDescription,
    })),
  );
}

/** Tags a Transaction through a Rule, so its Tags have source 'rule'. */
async function tagByRule(description: string, tagName: string): Promise<void> {
  const tag = await createTag(t.ctx, tagName);
  await createRule(t.ctx, {
    name: `Tag ${tagName}`,
    conditions: [{ type: 'text', field: 'description', operator: 'contains', value: description }],
    actions: { payeeId: null, categoryId: null, tagIds: [tag.id] },
  });
  await applyRulesToExisting(t.ctx, {});
}

const tagsOf = async (id: string) =>
  (await getClassification(t.ctx, id)).tags.map(({ name, source }) => ({ name, source }));

describe('bulk edit adding Tags', () => {
  it('keeps every Tag a Transaction has, from Rules too, and adds only the missing ones as manual', async () => {
    const [ruled, tagged, bare] = await seed('MIGROS', 'COOP', 'KIOSK');
    await tagByRule('MIGROS', 'Food');
    await editClassification(t.ctx, tagged!, { tagNames: ['Family', 'Trip'] });

    const result = await bulkEditClassification(t.ctx, {
      transactionIds: [ruled!, tagged!, bare!],
      changes: { addTagNames: ['Trip', 'Weekly'] },
    });

    expect(result.count).toBe(3);
    expect(await tagsOf(ruled!)).toEqual([
      { name: 'Food', source: 'rule' },
      { name: 'Trip', source: 'manual' },
      { name: 'Weekly', source: 'manual' },
    ]);
    expect(await tagsOf(tagged!)).toEqual([
      { name: 'Family', source: 'manual' },
      { name: 'Trip', source: 'manual' },
      { name: 'Weekly', source: 'manual' },
    ]);
    expect(await tagsOf(bare!)).toEqual([
      { name: 'Trip', source: 'manual' },
      { name: 'Weekly', source: 'manual' },
    ]);
  });
});

describe('bulk edit removing Tags', () => {
  it('deletes only the named Tags and leaves the others in place', async () => {
    const [ruled, tagged, bare] = await seed('MIGROS', 'COOP', 'KIOSK');
    await tagByRule('MIGROS', 'Food');
    await editClassification(t.ctx, tagged!, { tagNames: ['Family', 'Trip', 'Weekly'] });
    const { id: food } = (await getClassification(t.ctx, ruled!)).tags[0]!;
    const trip = (await getClassification(t.ctx, tagged!)).tags.find((tag) => tag.name === 'Trip');

    const result = await bulkEditClassification(t.ctx, {
      transactionIds: [ruled!, tagged!, bare!],
      changes: { removeTagIds: [food, trip!.id] },
    });

    // `bare` had neither Tag, so nothing on it changed.
    expect(result.count).toBe(2);
    expect(await tagsOf(ruled!)).toEqual([]);
    expect(await tagsOf(tagged!)).toEqual([
      { name: 'Family', source: 'manual' },
      { name: 'Weekly', source: 'manual' },
    ]);
    expect(await tagsOf(bare!)).toEqual([]);
  });
});

describe('bulk edit of Tags, adding or removing', () => {
  it('locks the Tags field, so a later Rule run adds no Tags', async () => {
    const [added, removed] = await seed('MIGROS ONE', 'MIGROS TWO');
    const trip = await createTag(t.ctx, 'Trip');
    await bulkEditClassification(t.ctx, {
      transactionIds: [added!],
      changes: { addTagNames: ['Family'] },
    });
    await bulkEditClassification(t.ctx, {
      transactionIds: [removed!],
      changes: { removeTagIds: [trip.id] },
    });

    await tagByRule('MIGROS', 'Food');

    for (const id of [added!, removed!]) {
      expect((await getClassification(t.ctx, id)).lockedFields).toEqual(['tags']);
    }
    expect(await tagsOf(added!)).toEqual([{ name: 'Family', source: 'manual' }]);
    expect(await tagsOf(removed!)).toEqual([]);
  });

  it("leaves a Split's line Tags as they are", async () => {
    const [id] = await seed('MIGROS');
    const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const groceries = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
    await splitTransaction(t.ctx, id!, [
      { amountMinor: -600, categoryId: groceries.id, tagNames: ['Family'] },
      { amountMinor: -400, categoryId: groceries.id, tagNames: ['Trip'] },
    ]);
    const lineTags = async () =>
      (await getClassification(t.ctx, id!)).splitLines.map((line) =>
        line.tags.map((tag) => tag.name),
      );
    const family = (await listTags(t.ctx)).find((tag) => tag.name === 'Family')!;

    await bulkEditClassification(t.ctx, {
      transactionIds: [id!],
      changes: { addTagNames: ['Trip'] },
    });
    await bulkEditClassification(t.ctx, {
      transactionIds: [id!],
      changes: { removeTagIds: [family.id] },
    });

    expect(await tagsOf(id!)).toEqual([{ name: 'Trip', source: 'manual' }]);
    expect(await lineTags()).toEqual([['Family'], ['Trip']]);
  });

  it('writes one Batch per action, with History showing the Tags before and after', async () => {
    const [first, second] = await seed('A', 'B');
    await editClassification(t.ctx, first!, { tagNames: ['Family'] });
    const family = (await listTags(t.ctx)).find((tag) => tag.name === 'Family')!;

    const added = await bulkEditClassification(t.ctx, {
      transactionIds: [first!, second!],
      changes: { addTagNames: ['Vacation 2024'] },
    });
    const removed = await bulkEditClassification(t.ctx, {
      transactionIds: [first!],
      changes: { removeTagIds: [family.id] },
    });

    expect((await listTags(t.ctx)).map((tag) => tag.name)).toContain('Vacation 2024');
    const tagHistory = async (batchId: string) =>
      (await listHistory(t.ctx, { batchId, entityType: 'transaction' }))
        .filter((entry) => entry.field === 'tags')
        .map(({ entityId, before, after }) => ({ entityId, before, after }));
    expect(await tagHistory(added.batchId)).toEqual(
      expect.arrayContaining([
        { entityId: first, before: ['Family'], after: ['Family', 'Vacation 2024'] },
        { entityId: second, before: [], after: ['Vacation 2024'] },
      ]),
    );
    expect(await tagHistory(removed.batchId)).toEqual([
      { entityId: first, before: ['Family', 'Vacation 2024'], after: ['Vacation 2024'] },
    ]);
    expect(await getBatchSummaries(t.ctx, [added.batchId, removed.batchId])).toEqual({
      [added.batchId]: 'Bulk edit of 2 Transactions: Tags added Vacation 2024',
      [removed.batchId]: 'Bulk edit of 1 Transaction: Tags removed Family',
    });
  });
});

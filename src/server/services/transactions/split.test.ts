import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  getCategory,
  mergeCategory,
} from '../categories';
import type { CategoryGroupType } from '../categories';
import { listHistory } from '../history';
import { deleteTag, listTags, mergeTags } from '../tags';
import { bulkEditClassification } from './bulk-edit';
import { editClassification } from './classification';
import { updateManualTransaction } from './manual';
import { getTransaction, listTransactions } from '.';
import { getClassificationProgress, listUnclassifiedGroups } from './unclassified';
import { removeSplit, splitTransaction } from './split';

const t = setupTestDatabase();

async function account() {
  const bank = await createBank(t.ctx, { name: `Bank ${Math.random()}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

async function transaction({ amountMinor = -10000, isManual = false } = {}): Promise<string> {
  const [id] = await seedTransactions(t.ctx.db, await account(), [
    { bookingDate: '2025-10-03', amountMinor, rawDescription: 'MIGROS GENEVE', isManual },
  ]);
  return id!;
}

async function category(name: string, groupName: string, type: CategoryGroupType = 'expense') {
  const group = await createCategoryGroup(t.ctx, { name: groupName, type });
  return createCategory(t.ctx, { groupId: group.id, name });
}

describe('split a Transaction', () => {
  it('divides the amount into Split lines with a Category, Tags and a note each', async () => {
    const id = await transaction({ amountMinor: -10000 });
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');

    await splitTransaction(t.ctx, id, [
      { amountMinor: -7000, categoryId: groceries.id, tagNames: ['Family'], note: ' weekly ' },
      { amountMinor: -3000, categoryId: household.id },
    ]);

    const detail = await getTransaction(t.ctx, id);
    expect(detail).toMatchObject({ amountMinor: -10000, category: null });
    expect(detail.splitLines).toMatchObject([
      {
        amountMinor: -7000,
        category: { id: groceries.id, name: 'Groceries', groupName: 'Food' },
        tags: [{ name: 'Family' }],
        note: 'weekly',
      },
      { amountMinor: -3000, category: { id: household.id }, tags: [], note: null },
    ]);
  });

  it("refuses a Split with fewer than two lines, a line without a Category, or lines that don't add up", async () => {
    const id = await transaction({ amountMinor: -10000 });
    const groceries = await category('Groceries', 'Food');
    const split = (lines: Parameters<typeof splitTransaction>[2]) =>
      splitTransaction(t.ctx, id, lines);

    await expect(split([{ amountMinor: -10000, categoryId: groceries.id }])).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('at least two'),
    });
    await expect(
      split([
        { amountMinor: -7000, categoryId: groceries.id },
        { amountMinor: -3000, categoryId: null as never },
      ]),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringContaining('Category') });
    await expect(
      split([
        { amountMinor: -7000, categoryId: groceries.id },
        { amountMinor: -2999, categoryId: groceries.id },
      ]),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringContaining('add up') });
    await expect(
      split([
        { amountMinor: -7000, categoryId: groceries.id },
        { amountMinor: -3000, categoryId: '00000000-0000-4000-8000-000000000000' },
      ]),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await getTransaction(t.ctx, id)).splitLines).toEqual([]);
    expect(await listHistory(t.ctx, { entityType: 'transaction' })).toEqual([]);
  });

  it('accepts lines of different signs and of any Category group type, including Capital', async () => {
    const id = await transaction({ amountMinor: -150000 });
    const principal = await category('Mortgage principal', 'Loans', 'capital');
    const interest = await category('Interest', 'Bank costs');
    const refund = await category('Refunds', 'Other income', 'income');

    await splitTransaction(t.ctx, id, [
      { amountMinor: -120000, categoryId: principal.id },
      { amountMinor: -32000, categoryId: interest.id },
      { amountMinor: 2000, categoryId: refund.id },
    ]);

    expect(
      (await getTransaction(t.ctx, id)).splitLines.map((line) => line.category.groupType),
    ).toEqual(['capital', 'expense', 'income']);
  });

  it('splits imported and Manual transactions without touching the bank fields', async () => {
    const imported = await transaction();
    const manual = await transaction({ isManual: true });
    const groceries = await category('Groceries', 'Food');
    const lines = [
      { amountMinor: -4000, categoryId: groceries.id },
      { amountMinor: -6000, categoryId: groceries.id },
    ];
    const before = await getTransaction(t.ctx, imported);

    await splitTransaction(t.ctx, imported, lines);
    await splitTransaction(t.ctx, manual, lines);

    const after = await getTransaction(t.ctx, imported);
    const bankFields = ({
      fingerprint,
      amountMinor,
      bookingDate,
      rawDescription,
    }: typeof before) => ({ fingerprint, amountMinor, bookingDate, rawDescription });
    expect(bankFields(after)).toEqual(bankFields(before));
    expect((await getTransaction(t.ctx, manual)).splitLines).toHaveLength(2);
  });
});

async function splitInTwo(id: string, amountMinor = -10000): Promise<void> {
  const groceries = await category(`Groceries ${Math.random()}`, `Food ${Math.random()}`);
  const household = await category(`Household ${Math.random()}`, `Home ${Math.random()}`);
  await splitTransaction(t.ctx, id, [
    { amountMinor: amountMinor + 2500, categoryId: groceries.id },
    { amountMinor: -2500, categoryId: household.id },
  ]);
}

describe('a split Transaction', () => {
  it('shows once in the list at its full amount, with its Split lines', async () => {
    const id = await transaction({ amountMinor: -10000 });
    await splitInTwo(id);

    const page = await listTransactions(t.ctx);

    expect(page.total).toBe(1);
    expect(page.transactions[0]).toMatchObject({ id, amountMinor: -10000, category: null });
    expect(page.transactions[0]!.splitLines.map((line) => line.amountMinor)).toEqual([
      -7500, -2500,
    ]);
  });

  it('is never Unclassified, and counts as classified in the progress', async () => {
    const id = await transaction();
    await transaction();
    await splitInTwo(id);

    const unclassified = await listTransactions(t.ctx, { unclassified: true });
    expect(unclassified.transactions.map((tx) => tx.id)).not.toContain(id);
    expect((await listUnclassifiedGroups(t.ctx)).groups.map((g) => g.count)).toEqual([1]);
    expect(await getClassificationProgress(t.ctx)).toMatchObject({ total: 2, unclassified: 1 });
  });
});

describe('remove a Split', () => {
  it('takes the Split lines away and makes the Transaction Unclassified again', async () => {
    const id = await transaction();
    await splitInTwo(id);

    const result = await removeSplit(t.ctx, id);

    expect(result).toMatchObject({ category: null, splitLines: [] });
    expect((await getTransaction(t.ctx, id)).splitLines).toEqual([]);
    expect(
      (await listTransactions(t.ctx, { unclassified: true })).transactions.map((tx) => tx.id),
    ).toEqual([id]);
  });

  it('refuses a Transaction that is not split, or does not exist', async () => {
    const id = await transaction();

    await expect(removeSplit(t.ctx, id)).rejects.toMatchObject({ code: 'validation' });
    await expect(removeSplit(t.ctx, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe("a split Transaction's classification", () => {
  it('refuses a Category change, directly or by bulk edit, telling the user to edit or remove the Split', async () => {
    const id = await transaction();
    const other = await transaction();
    await splitInTwo(id);
    const groceries = await category('Groceries', 'Food');
    const refusal = { code: 'validation', message: expect.stringMatching(/Split/) };

    await expect(editClassification(t.ctx, id, { categoryId: groceries.id })).rejects.toMatchObject(
      refusal,
    );
    await expect(editClassification(t.ctx, id, { categoryId: null })).rejects.toMatchObject(
      refusal,
    );
    await expect(
      bulkEditClassification(t.ctx, {
        transactionIds: [other, id],
        changes: { categoryId: groceries.id },
      }),
    ).rejects.toMatchObject(refusal);
    expect((await getTransaction(t.ctx, other)).category).toBeNull();
    expect((await getTransaction(t.ctx, id)).splitLines).toHaveLength(2);
  });

  it('keeps its Payee, Tags and notes editable, by hand and by bulk edit', async () => {
    const id = await transaction();
    await splitInTwo(id);

    await editClassification(t.ctx, id, { payeeName: 'Migros', tagNames: ['Family'], notes: 'n' });
    await bulkEditClassification(t.ctx, { transactionIds: [id], changes: { tagNames: ['Trip'] } });

    expect(await getTransaction(t.ctx, id)).toMatchObject({
      payee: { name: 'Migros' },
      tags: [{ name: 'Trip' }],
      notes: 'n',
      category: null,
    });
    expect((await getTransaction(t.ctx, id)).splitLines).toHaveLength(2);
  });
});

describe('Split History', () => {
  it('records creating, editing and removing a Split, each in one Batch by the manual edit', async () => {
    const id = await transaction({ amountMinor: -10000 });
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');
    const batchOf = async () => {
      const [latest] = await listHistory(t.ctx, { entityId: id });
      return listHistory(t.ctx, { batchId: latest!.batchId });
    };

    await splitTransaction(t.ctx, id, [
      { amountMinor: -7000, categoryId: groceries.id, tagNames: ['Family'], note: 'weekly' },
      { amountMinor: -3000, categoryId: household.id },
    ]);
    const created = await batchOf();
    await splitTransaction(t.ctx, id, [
      { amountMinor: -6000, categoryId: groceries.id },
      { amountMinor: -4000, categoryId: household.id },
    ]);
    const edited = await batchOf();
    await removeSplit(t.ctx, id);
    const removed = await batchOf();

    const split = (entries: typeof created) => entries.find((entry) => entry.field === 'split');
    expect(split(created)).toMatchObject({
      entityType: 'transaction',
      actorType: 'manual',
      before: null,
      after: [
        { amountMinor: -7000, category: 'Food › Groceries', tags: ['Family'], note: 'weekly' },
        { amountMinor: -3000, category: 'Home › Household', tags: [], note: null },
      ],
    });
    expect(created.map((entry) => entry.entityType)).toContain('tag');
    expect(split(edited)).toMatchObject({
      before: [expect.objectContaining({ amountMinor: -7000 }), expect.anything()],
      after: [expect.objectContaining({ amountMinor: -6000 }), expect.anything()],
    });
    expect(split(removed)).toMatchObject({ before: expect.any(Array), after: null });
    expect(new Set([created, edited, removed].map((batch) => batch[0]!.batchId)).size).toBe(3);
    expect([...created, ...edited, ...removed].every((e) => e.actorType === 'manual')).toBe(true);
  });
});

describe('a split Manual transaction', () => {
  it('refuses an amount change until the Split is removed, but takes other edits', async () => {
    const id = await transaction({ amountMinor: -10000, isManual: true });
    await splitInTwo(id);
    const edit = { bookingDate: '2025-10-04', amountMinor: -10000, description: 'Coop' };

    await expect(
      updateManualTransaction(t.ctx, id, { ...edit, amountMinor: -12000 }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringMatching(/remove the Split/),
    });
    await updateManualTransaction(t.ctx, id, edit);

    expect(await getTransaction(t.ctx, id)).toMatchObject({
      amountMinor: -10000,
      bookingDate: '2025-10-04',
      rawDescription: 'Coop',
    });
    expect((await getTransaction(t.ctx, id)).splitLines).toHaveLength(2);
  });
});

describe('Categories and Tags used by Split lines', () => {
  it('refuses to delete a Category a Split line uses, and counts the Transaction under it', async () => {
    const id = await transaction();
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');
    await splitTransaction(t.ctx, id, [
      { amountMinor: -6000, categoryId: groceries.id },
      { amountMinor: -4000, categoryId: household.id },
    ]);

    expect((await getCategory(t.ctx, groceries.id)).transactionCount).toBe(1);
    await expect(deleteCategory(t.ctx, groceries.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('a Category merge moves Split lines to the target and records it on the Transaction', async () => {
    const id = await transaction();
    const shops = await category('Shops', 'Food');
    const groceries = await category('Groceries', 'Groceries group');
    const household = await category('Household', 'Home');
    await splitTransaction(t.ctx, id, [
      { amountMinor: -6000, categoryId: shops.id },
      { amountMinor: -4000, categoryId: household.id },
    ]);

    const result = await mergeCategory(t.ctx, shops.id, groceries.id);

    expect(result.transactionCount).toBe(1);
    expect((await getTransaction(t.ctx, id)).splitLines.map((line) => line.category.id)).toEqual([
      groceries.id,
      household.id,
    ]);
    const batch = await listHistory(t.ctx, { batchId: result.batchId });
    expect(batch.find((entry) => entry.field === 'split')).toMatchObject({
      entityId: id,
      after: [
        expect.objectContaining({ category: 'Groceries group › Groceries' }),
        expect.anything(),
      ],
    });
  });

  it('a Tag merge moves Split line Tags to the target, and deleting a Tag takes it off Split lines', async () => {
    const id = await transaction();
    const groceries = await category('Groceries', 'Food');
    await splitTransaction(t.ctx, id, [
      { amountMinor: -6000, categoryId: groceries.id, tagNames: ['Reno', 'Home'] },
      { amountMinor: -4000, categoryId: groceries.id, tagNames: ['Renovation'] },
    ]);
    const tagId = async (name: string) =>
      (await listTags(t.ctx)).find((tag) => tag.name === name)!.id;
    expect((await listTags(t.ctx)).find((tag) => tag.name === 'Reno')?.transactionCount).toBe(1);

    const merged = await mergeTags(t.ctx, await tagId('Reno'), await tagId('Renovation'));
    expect(merged.transactionCount).toBe(1);
    expect(
      (await getTransaction(t.ctx, id)).splitLines.map((l) => l.tags.map((tag) => tag.name)),
    ).toEqual([['Home', 'Renovation'], ['Renovation']]);

    const deleted = await deleteTag(t.ctx, await tagId('Renovation'));
    expect(deleted.transactionCount).toBe(1);
    expect(
      (await getTransaction(t.ctx, id)).splitLines.map((l) => l.tags.map((tag) => tag.name)),
    ).toEqual([['Home'], []]);
    const batch = await listHistory(t.ctx, { batchId: deleted.batchId });
    expect(batch.find((entry) => entry.field === 'split')).toMatchObject({ entityId: id });
  });
});

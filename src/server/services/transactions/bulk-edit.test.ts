import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getBatchSummaries, listHistory } from '../history';
import { bulkEditClassification } from './bulk-edit';
import { editClassification, getClassification } from './classification';
import { listUnclassifiedGroups } from './unclassified';

const t = setupTestDatabase();

async function seed(rows: SeedTransaction[]): Promise<string[]> {
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
  return seedTransactions(t.ctx.db, account, rows);
}

const row = (rawDescription: string): SeedTransaction => ({
  bookingDate: '2025-10-03',
  amountMinor: -1000,
  rawDescription,
});

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

describe('bulk edit', () => {
  it('classifies and locks every member of a group, in one Batch with a summary', async () => {
    const [migros1, migros2, coop] = await seed([row('MIGROS'), row('Migros '), row('COOP')]);
    const category = await groceries();

    const result = await bulkEditClassification(t.ctx, {
      groupKey: 'migros',
      changes: { payeeName: 'Migros', categoryId: category.id, tagNames: ['Food'] },
    });

    expect(result.count).toBe(2);
    for (const id of [migros1!, migros2!]) {
      expect(await getClassification(t.ctx, id)).toMatchObject({
        payee: { name: 'Migros' },
        category: { id: category.id },
        tags: [{ name: 'Food', source: 'manual' }],
        lockedFields: ['payee', 'category', 'tags'],
      });
    }
    expect(await getClassification(t.ctx, coop!)).toMatchObject({
      category: null,
      lockedFields: [],
    });

    const entries = await listHistory(t.ctx, {
      batchId: result.batchId,
      entityType: 'transaction',
    });
    expect(new Set(entries.map((entry) => entry.entityId))).toEqual(new Set([migros1, migros2]));
    expect(await getBatchSummaries(t.ctx, [result.batchId])).toEqual({
      [result.batchId]:
        'Bulk edit of 2 Transactions: Payee Migros, Category Food › Groceries, Tags Food',
    });
    expect((await listUnclassifiedGroups(t.ctx)).groups.map((group) => group.key)).toEqual([
      'coop',
    ]);
  });

  it('edits only the selected Transactions, leaving other fields untouched', async () => {
    const [first, second, third] = await seed([row('A'), row('B'), row('C')]);
    await editClassification(t.ctx, first!, { notes: 'keep me' });

    const result = await bulkEditClassification(t.ctx, {
      transactionIds: [first!, second!],
      changes: { payeeName: 'Shop' },
    });

    expect(result.count).toBe(2);
    expect(await getClassification(t.ctx, first!)).toMatchObject({
      payee: { name: 'Shop' },
      notes: 'keep me',
      lockedFields: ['payee', 'notes'],
    });
    expect(await getClassification(t.ctx, third!)).toMatchObject({ payee: null });
  });

  it('only takes group members that are still Unclassified', async () => {
    const [classified, open] = await seed([row('SBB'), row('SBB')]);
    const category = await groceries();
    await editClassification(t.ctx, classified!, { categoryId: category.id });

    const result = await bulkEditClassification(t.ctx, {
      groupKey: 'sbb',
      changes: { payeeName: 'SBB' },
    });

    expect(result.count).toBe(1);
    expect(await getClassification(t.ctx, open!)).toMatchObject({ payee: { name: 'SBB' } });
    expect(await getClassification(t.ctx, classified!)).toMatchObject({ payee: null });
  });

  it('refuses an edit with nothing to change or nothing selected', async () => {
    const [id] = await seed([row('A')]);

    await expect(
      bulkEditClassification(t.ctx, { transactionIds: [id!], changes: {} }),
    ).rejects.toThrow('Choose a Payee, Category or Tags to set');
    await expect(
      bulkEditClassification(t.ctx, { transactionIds: [], changes: { payeeName: 'X' } }),
    ).rejects.toThrow('Select at least one Transaction');
  });

  it('changes nothing when one Transaction fails', async () => {
    const [id] = await seed([row('A')]);

    await expect(
      bulkEditClassification(t.ctx, {
        transactionIds: [id!, '00000000-0000-4000-8000-000000000000'],
        changes: { payeeName: 'Shop' },
      }),
    ).rejects.toThrow('Transaction not found');
    expect(await getClassification(t.ctx, id!)).toMatchObject({ payee: null, lockedFields: [] });
    expect(await listHistory(t.ctx, { entityType: 'transaction' })).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, deleteCategory, getCategory } from '../categories';
import { listHistory } from '../history';
import {
  commitImport,
  deleteImportedTransaction,
  listImportTransactions,
  previewImport,
  undoImport,
  type Import,
} from '../imports';
import { createManualTransaction, deleteManualTransaction } from './manual';
import { splitTransaction } from './split';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const UBS_OCTOBER = 'ubs/ubs-chf-2025-10.csv';

async function ubsAccount(): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'UBS' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'UBS current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

async function importOctober(account: Account): Promise<Import> {
  const content = readFileSync(path.join(FIXTURES, UBS_OCTOBER));
  const preview = await previewImport(t.ctx, {
    accountId: account.id,
    fileName: path.basename(UBS_OCTOBER),
    content,
  });
  return commitImport(t.ctx, { previewId: preview.id });
}

/** Two Categories to split into; deletable only once no Split line uses them. */
async function categories() {
  const group = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const groceries = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
  const household = await createCategory(t.ctx, { groupId: group.id, name: 'Household' });
  return { groceries, household };
}

/** Splits a (negative, over 100 CHF) Transaction: 100 CHF of Household, the rest Groceries. */
async function splitInTwo(
  id: string,
  amountMinor: number,
  { groceries, household }: Awaited<ReturnType<typeof categories>>,
): Promise<void> {
  await splitTransaction(t.ctx, id, [
    { amountMinor: amountMinor + 10000, categoryId: groceries.id, tagNames: ['family'] },
    { amountMinor: -10000, categoryId: household.id, note: 'bulbs' },
  ]);
}

/** The History entries of the newest Batch touching a Transaction. */
async function latestBatchOf(transactionId: string) {
  const [latest] = await listHistory(t.ctx, { entityId: transactionId });
  return listHistory(t.ctx, { batchId: latest!.batchId });
}

/** The Split lines a deletion recorded for a Transaction in a Batch. */
function removedSplit(batch: Awaited<ReturnType<typeof latestBatchOf>>, transactionId: string) {
  return batch.find(
    (entry) =>
      entry.entityType === 'transaction' &&
      entry.entityId === transactionId &&
      entry.field === 'split',
  );
}

/** No Split line is left: the Categories count no use and can be deleted. */
async function expectNoSplitLinesLeft(cats: Awaited<ReturnType<typeof categories>>) {
  for (const category of [cats.groceries, cats.household]) {
    expect((await getCategory(t.ctx, category.id)).transactionCount).toBe(0);
    await deleteCategory(t.ctx, category.id);
  }
}

const EXPECTED_LINES = (amountMinor: number) => [
  { amountMinor: amountMinor + 10000, category: 'Living › Groceries', tags: ['family'] },
  { amountMinor: -10000, category: 'Living › Household', note: 'bulbs' },
];

describe('undo an Import with split Transactions', () => {
  it('removes their Split lines and records them in the undo Batch', async () => {
    const account = await ubsAccount();
    const october = await importOctober(account);
    const [first] = await listImportTransactions(t.ctx, october.id);
    const cats = await categories();
    await splitInTwo(first!.id, first!.amountMinor, cats);

    await undoImport(t.ctx, october.id);

    expect(await listImportTransactions(t.ctx, october.id)).toEqual([]);
    const batch = await latestBatchOf(first!.id);
    expect(batch.map((entry) => `${entry.entityType}:${entry.entityId}`)).toContain(
      `import:${october.id}`,
    );
    expect(removedSplit(batch, first!.id)).toMatchObject({
      actorType: 'manual',
      before: EXPECTED_LINES(first!.amountMinor),
      after: null,
    });
    await expectNoSplitLinesLeft(cats);
  });
});

describe('delete a split imported Transaction', () => {
  it('removes its Split lines and records them in the deletion Batch', async () => {
    const account = await ubsAccount();
    const october = await importOctober(account);
    const [first, second] = await listImportTransactions(t.ctx, october.id);
    const cats = await categories();
    await splitInTwo(first!.id, first!.amountMinor, cats);

    await deleteImportedTransaction(t.ctx, first!.id);

    const remaining = await listImportTransactions(t.ctx, october.id);
    expect(remaining.map((tr) => tr.id)).not.toContain(first!.id);
    expect(remaining.map((tr) => tr.id)).toContain(second!.id);
    const batch = await latestBatchOf(first!.id);
    expect(batch.every((entry) => entry.after === null)).toBe(true);
    expect(removedSplit(batch, first!.id)).toMatchObject({
      before: EXPECTED_LINES(first!.amountMinor),
      after: null,
    });
    await expectNoSplitLinesLeft(cats);
  });
});

describe('delete a split Manual transaction', () => {
  it('removes its Split lines and records them in the deletion Batch', async () => {
    const account = await ubsAccount();
    const created = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-03-14',
      amountMinor: -45900,
      description: 'Migros',
    });
    const cats = await categories();
    await splitInTwo(created.id, created.amountMinor, cats);

    await deleteManualTransaction(t.ctx, created.id);

    const batch = await latestBatchOf(created.id);
    expect(batch.every((entry) => entry.after === null)).toBe(true);
    expect(removedSplit(batch, created.id)).toMatchObject({
      before: EXPECTED_LINES(-45900),
      after: null,
    });
    await expectNoSplitLinesLeft(cats);
  });
});

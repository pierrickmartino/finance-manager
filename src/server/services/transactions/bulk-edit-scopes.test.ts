import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getBatchSummaries, listHistory } from '../history';
import { listTags } from '../tags';
import { bulkEditClassification, MAX_BULK_EDIT } from './bulk-edit';
import { getClassification } from './classification';
import { listTransactions, type TransactionQuery } from './index';
import { splitTransaction } from './split';

/** Bulk edit scopes (#149): a Transactions filter, matched as the list matches it, and the limit. */
const t = setupTestDatabase();

async function newAccount() {
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

const row = (rawDescription: string, amountMinor = -1000): SeedTransaction => ({
  bookingDate: '2025-10-03',
  amountMinor,
  rawDescription,
});

async function category(name: string) {
  const group = await createCategoryGroup(t.ctx, { name: `Group ${name}`, type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name });
}

/** Every Transaction id the list returns for this filter, across all its pages. */
async function listedIds(filter: TransactionQuery): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const result = await listTransactions(t.ctx, { ...filter, page, pageSize: 2 });
    ids.push(...result.transactions.map((transaction) => transaction.id));
    if (page >= result.pageCount) return ids;
  }
}

describe('bulk edit with a filter scope', () => {
  it('edits exactly the Transactions the list returns for the filter, across pages', async () => {
    const account = await newAccount();
    const other = await newAccount();
    const ids = await seedTransactions(t.ctx.db, account, [
      row('COOP Basel', -500),
      row('Coop Pronto', -2500),
      row('COOP Zürich', -9000),
      row('MIGROS', -500),
      row('coop big', -50_000),
    ]);
    const [otherCoop] = await seedTransactions(t.ctx.db, other, [row('COOP Bern', -500)]);
    const filter = { accountId: account.id, text: 'coop', amountMin: -10_000 };
    const expected = await listedIds(filter);
    expect(expected).toHaveLength(3);
    const groceries = await category('Groceries');

    const result = await bulkEditClassification(t.ctx, {
      filter,
      changes: { categoryId: groceries.id },
    });

    expect(result.count).toBe(3);
    const edited = [];
    for (const id of [...ids, otherCoop!]) {
      const classification = await getClassification(t.ctx, id);
      if (classification.category?.id === groceries.id) edited.push(id);
    }
    expect(new Set(edited)).toEqual(new Set(expected));
    expect(await getBatchSummaries(t.ctx, [result.batchId])).toEqual({
      [result.batchId]: 'Bulk edit of 3 Transactions: Category Group Groceries › Groceries',
    });
  });

  it('matches a split Transaction by its Split lines, as the list does', async () => {
    const account = await newAccount();
    const [plain, split, unrelated] = await seedTransactions(t.ctx.db, account, [
      row('A'),
      row('B'),
      row('C'),
    ]);
    const travel = await category('Travel');
    const food = await category('Food');
    await bulkEditClassification(t.ctx, {
      transactionIds: [plain!],
      changes: { categoryId: travel.id },
    });
    await splitTransaction(t.ctx, split!, [
      { amountMinor: -600, categoryId: travel.id },
      { amountMinor: -400, categoryId: food.id },
    ]);
    const filter = { accountId: account.id, categoryId: travel.id };
    expect(new Set(await listedIds(filter))).toEqual(new Set([plain, split]));

    const result = await bulkEditClassification(t.ctx, {
      filter,
      changes: { addTagNames: ['Trip'] },
    });

    expect(result.count).toBe(2);
    expect(await getClassification(t.ctx, plain!)).toMatchObject({ tags: [{ name: 'Trip' }] });
    expect(await getClassification(t.ctx, split!)).toMatchObject({ tags: [{ name: 'Trip' }] });
    expect(await getClassification(t.ctx, unrelated!)).toMatchObject({ tags: [] });
  });

  it('refuses a filter that matches nothing', async () => {
    const account = await newAccount();
    await seedTransactions(t.ctx.db, account, [row('A')]);

    await expect(
      bulkEditClassification(t.ctx, {
        filter: { accountId: account.id, text: 'nothing like this' },
        changes: { payeeName: 'X' },
      }),
    ).rejects.toThrow('Select at least one Transaction');
  });
});

describe('the Bulk edit limit', () => {
  /** One more Transaction than a Bulk edit takes, all "TWINT DENNER" (one Unclassified group). */
  const OVER_LIMIT = 10_001;

  it('refuses a filter, a group or ids over 10,000 Transactions, writing nothing', async () => {
    expect(MAX_BULK_EDIT).toBe(10_000);
    const account = await newAccount();
    await seedTransactions(t.ctx.db, account, [row('first')]);
    await t.ctx.db.query(
      `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
         currency, fingerprint, raw_description)
       SELECT $1, imp.id, false, DATE '2024-01-01' + (n % 300), -n, 'CHF', 'limit-' || n,
              'TWINT DENNER'
       FROM generate_series(1, $2::int) AS n, import imp WHERE imp.account_id = $1`,
      [account.id, OVER_LIMIT],
    );
    const ids = (await t.ctx.db.query<{ id: string }>('SELECT id FROM "transaction"')).rows.map(
      (r) => r.id,
    );
    const changes = { addTagNames: ['Too many'] };
    const historyBefore = await listHistory(t.ctx, { entityType: 'transaction' });

    await expect(
      bulkEditClassification(t.ctx, { filter: { text: 'denner' }, changes }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Narrow the filter: 10,001 match, at most 10,000 per edit',
    });
    await expect(
      bulkEditClassification(t.ctx, { groupKey: 'twint denner', changes }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'This group has 10,001 Transactions, at most 10,000 per edit',
    });
    await expect(
      bulkEditClassification(t.ctx, { transactionIds: ids.slice(0, OVER_LIMIT), changes }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Select at most 10,000 Transactions per edit',
    });

    expect((await listTags(t.ctx)).map((tag) => tag.name)).not.toContain('Too many');
    expect(await listHistory(t.ctx, { entityType: 'transaction' })).toEqual(historyBefore);
  }, 60_000);

  it('takes a filter of exactly 10,000 Transactions', async () => {
    const account = await newAccount();
    await seedTransactions(t.ctx.db, account, [row('first')]);
    await t.ctx.db.query(
      `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
         currency, fingerprint, raw_description)
       SELECT $1, imp.id, false, DATE '2024-01-01' + (n % 300), -n, 'CHF', 'max-' || n, 'VOLG'
       FROM generate_series(1, $2::int) AS n, import imp WHERE imp.account_id = $1`,
      [account.id, MAX_BULK_EDIT],
    );

    const result = await bulkEditClassification(t.ctx, {
      filter: { accountId: account.id, text: 'volg' },
      changes: { payeeName: 'Volg' },
    });

    expect(result.count).toBe(MAX_BULK_EDIT);
  }, 60_000);
});

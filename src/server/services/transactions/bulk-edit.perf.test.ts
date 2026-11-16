import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getBatchSummaries } from '../history';
import { bulkEditClassification } from './bulk-edit';
import { getClassificationProgress } from './unclassified';

/**
 * Bulk-editing 2 000 Transactions is one database transaction and finishes in reasonable time
 * (ticket #16). Measured on Postgres 16 (local, warm, 2026-10-30): 2 000 Transactions given a Payee,
 * a Category and one Tag in 1.3 s, most of it the 2 000 History inserts. The budget is
 * generous so a slow CI runner doesn't flake; it catches order-of-magnitude regressions.
 */
const t = setupTestDatabase();

const GROUP_SIZE = 2_000;
const BUDGET_MS = 10_000;

/** A new Account holding GROUP_SIZE Transactions described `description`, plus one other. */
async function seedAccount(name: string, description: string): Promise<string> {
  const bank = await createBank(t.ctx, { name: `${name} bank` });
  const account = await createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
  await seedTransactions(t.ctx.db, account, [{ bookingDate: '2021-01-01', amountMinor: 0 }]);
  await t.ctx.db.query(
    `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
       currency, fingerprint, raw_description)
     SELECT $1, imp.id, false, DATE '2021-01-01' + (n % 1800), -n, 'CHF', $3 || n, $3
     FROM generate_series(1, $2::int) AS n, import imp WHERE imp.account_id = $1`,
    [account.id, GROUP_SIZE, description],
  );
  await t.ctx.db.query('ANALYZE "transaction"');
  return account.id;
}

describe('bulk edit of 2 000 Transactions', () => {
  it('classifies a whole group in one Batch within budget', async () => {
    await seedAccount('Perf', 'TWINT MIGROS GENÈVE');
    const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const category = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });

    const start = performance.now();
    const result = await bulkEditClassification(t.ctx, {
      groupKey: 'twint migros geneve',
      changes: { payeeName: 'Migros', categoryId: category.id, addTagNames: ['Food'] },
    });
    const ms = performance.now() - start;

    expect(result.count).toBe(GROUP_SIZE);
    expect(Object.keys(await getBatchSummaries(t.ctx, [result.batchId]))).toEqual([result.batchId]);
    expect((await getClassificationProgress(t.ctx)).unclassified).toBe(1);
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 120_000);

  it('classifies every match of a Transactions filter in one Batch within budget (#149)', async () => {
    const accountId = await seedAccount('Perf filter', 'COOP PRONTO BASEL');
    const group = await createCategoryGroup(t.ctx, { name: 'Shops', type: 'expense' });
    const category = await createCategory(t.ctx, { groupId: group.id, name: 'Convenience' });

    const start = performance.now();
    const result = await bulkEditClassification(t.ctx, {
      filter: { accountId, text: 'coop pronto' },
      changes: { payeeName: 'Coop', categoryId: category.id, addTagNames: ['Food'] },
    });
    const ms = performance.now() - start;

    expect(result.count).toBe(GROUP_SIZE);
    expect(Object.keys(await getBatchSummaries(t.ctx, [result.batchId]))).toEqual([result.batchId]);
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 120_000);
});

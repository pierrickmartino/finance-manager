import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { createPayee } from '../payees';
import { createRule } from '../rules';
import { applyRulesToExisting, previewApplyRules } from '../rules/existing';
import { editClassification } from './classification';
import { splitTransaction } from './split';
import { getClassification, listTransactions } from '.';

/** The Transaction list's Payee filter with Payees on Split lines (ADR-0006). */

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

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

/** A plain Coop purchase and a bundled payment to Twint with one Coop line and one blank line. */
async function seedBundledPayment() {
  const category = await groceries();
  const coop = await createPayee(t.ctx, 'Coop');
  const [plain, bundled] = await seed([
    { bookingDate: '2025-10-01', amountMinor: -4590, rawDescription: 'COOP BASEL' },
    { bookingDate: '2025-10-02', amountMinor: -10000, rawDescription: 'TWINT ORDRE GROUPE' },
  ]);
  await editClassification(t.ctx, plain!, { payeeId: coop.id });
  await editClassification(t.ctx, bundled!, { payeeName: 'Twint' });
  await splitTransaction(t.ctx, bundled!, [
    { amountMinor: -6000, categoryId: category.id, payeeId: coop.id },
    { amountMinor: -1000, categoryId: category.id, payeeId: coop.id },
    { amountMinor: -3000, categoryId: category.id },
  ]);
  const twint = (await getClassification(t.ctx, bundled!)).payee!;
  return { coop, twint, plain: plain!, bundled: bundled! };
}

describe('filter Transactions by Payee with Payees on Split lines', () => {
  it('returns a split Transaction once, under its own Payee, when a Split line names the Payee', async () => {
    const { coop, plain, bundled } = await seedBundledPayment();

    const page = await listTransactions(t.ctx, { payeeId: coop.id });

    expect(page.total).toBe(2);
    expect(page.transactions.map((tx) => [tx.id, tx.payee?.name])).toEqual([
      [bundled, 'Twint'],
      [plain, 'Coop'],
    ]);
  });

  it("doesn't match a different Payee through a Split line inheriting the Transaction's Payee", async () => {
    const { twint, bundled } = await seedBundledPayment();
    const migros = await createPayee(t.ctx, 'Migros');

    const byTwint = await listTransactions(t.ctx, { payeeId: twint.id });
    const byMigros = await listTransactions(t.ctx, { payeeId: migros.id });

    expect(byTwint.transactions.map((tx) => tx.id)).toEqual([bundled]);
    expect(byMigros.total).toBe(0);
  });

  it('selects only Transactions with the Payee itself when applying Rules, not by Split lines', async () => {
    const { coop, plain, bundled } = await seedBundledPayment();
    const category = await createCategory(t.ctx, {
      groupId: (await createCategoryGroup(t.ctx, { name: 'Shops', type: 'expense' })).id,
      name: 'Supermarket',
    });
    await createRule(t.ctx, {
      name: 'Everything',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'O' }],
      actions: { payeeId: null, categoryId: category.id, tagIds: [] },
    });
    const filter = { payeeId: coop.id };

    const preview = await previewApplyRules(t.ctx, { filter });
    await applyRulesToExisting(t.ctx, { filter });

    expect(preview).toMatchObject({ examined: 1, changedCount: 1 });
    expect(preview.changes.map((change) => change.transactionId)).toEqual([plain]);
    expect((await getClassification(t.ctx, bundled)).category).toBeNull();
  });
});

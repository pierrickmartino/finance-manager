import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { exportTransactionsCsv } from '../export';
import { createPayee } from '../payees';
import { createRule } from '../rules';
import { applyRulesToExisting, previewApplyRules } from '../rules/existing';
import { editClassification } from './classification';
import { splitTransaction } from './split';
import { getClassification, listTransactions } from '.';

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

async function category(name: string, groupName: string) {
  const group = await createCategoryGroup(t.ctx, { name: groupName, type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name });
}

describe('filter Transactions by Category with Split lines', () => {
  it('returns a split Transaction once when any of its Split lines has the Category', async () => {
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');
    const [plain, split] = await seed([
      { bookingDate: '2025-10-01', amountMinor: -4590, rawDescription: 'COOP' },
      { bookingDate: '2025-10-02', amountMinor: -10000, rawDescription: 'MIGROS' },
    ]);
    await editClassification(t.ctx, plain!, { categoryId: groceries.id });
    await splitTransaction(t.ctx, split!, [
      { amountMinor: -6000, categoryId: groceries.id },
      { amountMinor: -1000, categoryId: household.id },
      { amountMinor: -3000, categoryId: groceries.id },
    ]);

    const page = await listTransactions(t.ctx, { categoryId: groceries.id });

    expect(page.total).toBe(2);
    expect(page.transactions.map((tx) => [tx.rawDescription, tx.amountMinor])).toEqual([
      ['MIGROS', -10000],
      ['COOP', -4590],
    ]);
  });

  it("exposes the summed amount of a split Transaction's lines in the Category", async () => {
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');
    const [plain, split] = await seed([
      { bookingDate: '2025-10-01', amountMinor: -4590, rawDescription: 'COOP' },
      { bookingDate: '2025-10-02', amountMinor: -10000, rawDescription: 'MIGROS' },
    ]);
    await editClassification(t.ctx, plain!, { categoryId: groceries.id });
    await splitTransaction(t.ctx, split!, [
      { amountMinor: -6000, categoryId: groceries.id },
      { amountMinor: -1000, categoryId: household.id },
      { amountMinor: -3000, categoryId: groceries.id },
    ]);

    const byGroceries = await listTransactions(t.ctx, { categoryId: groceries.id });
    const byHousehold = await listTransactions(t.ctx, { categoryId: household.id });
    const unfiltered = await listTransactions(t.ctx);

    expect(byGroceries.transactions.map((tx) => tx.matchingSplitAmountMinor)).toEqual([
      -9000,
      null,
    ]);
    expect(byHousehold.transactions.map((tx) => tx.matchingSplitAmountMinor)).toEqual([-1000]);
    expect(unfiltered.transactions.map((tx) => tx.matchingSplitAmountMinor)).toEqual([null, null]);
  });

  it('leaves out split Transactions with no Split line in the Category', async () => {
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');
    const leisure = await category('Cinema', 'Leisure');
    const [plain, split] = await seed([
      { bookingDate: '2025-10-01', amountMinor: -4590, rawDescription: 'COOP' },
      { bookingDate: '2025-10-02', amountMinor: -10000, rawDescription: 'MIGROS' },
    ]);
    await editClassification(t.ctx, plain!, { categoryId: groceries.id });
    await splitTransaction(t.ctx, split!, [
      { amountMinor: -7000, categoryId: household.id },
      { amountMinor: -3000, categoryId: leisure.id },
    ]);

    const page = await listTransactions(t.ctx, { categoryId: groceries.id });

    expect(page.total).toBe(1);
    expect(page.transactions.map((tx) => tx.rawDescription)).toEqual(['COOP']);
  });
});

describe('the Category filter outside the list', () => {
  async function seedSplitAndPlain() {
    const groceries = await category('Groceries', 'Food');
    const household = await category('Household', 'Home');
    const [plain, split] = await seed([
      { bookingDate: '2025-10-01', amountMinor: -4590, rawDescription: 'MIGROS GENEVE' },
      { bookingDate: '2025-10-02', amountMinor: -10000, rawDescription: 'MIGROS LAUSANNE' },
    ]);
    await editClassification(t.ctx, plain!, { categoryId: groceries.id });
    await splitTransaction(t.ctx, split!, [
      { amountMinor: -6000, categoryId: groceries.id },
      { amountMinor: -4000, categoryId: household.id },
    ]);
    return { groceries, plain: plain!, split: split! };
  }

  it('exports split Transactions with a Split line in the Category', async () => {
    const { groceries, plain, split } = await seedSplitAndPlain();
    let csv = '';
    for await (const chunk of exportTransactionsCsv(t.ctx, { categoryId: groceries.id })) {
      csv += chunk;
    }

    expect(csv).toContain(plain);
    expect(csv).toContain(split);
  });

  it('selects only Transactions with the Category itself when applying Rules, not split ones', async () => {
    const { groceries, split } = await seedSplitAndPlain();
    const migros = await createPayee(t.ctx, 'Migros');
    await createRule(t.ctx, {
      name: 'Migros',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'MIGROS' }],
      actions: { payeeId: migros.id, categoryId: null, tagIds: [] },
    });
    const filter = { categoryId: groceries.id };

    const preview = await previewApplyRules(t.ctx, { filter });
    await applyRulesToExisting(t.ctx, { filter });

    expect(preview).toMatchObject({ examined: 1, changedCount: 1 });
    expect(preview.changes.map((change) => change.rawDescription)).toEqual(['MIGROS GENEVE']);
    expect((await getClassification(t.ctx, split)).payee).toBeNull();
  });
});

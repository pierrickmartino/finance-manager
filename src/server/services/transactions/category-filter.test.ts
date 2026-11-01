import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type CategoryGroupType } from '../categories';
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

async function category(name: string, groupName: string, type: CategoryGroupType = 'expense') {
  const group = await createCategoryGroup(t.ctx, { name: groupName, type });
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

/** The export's data rows as cells (header dropped; no cell in these tests holds a semicolon or quote). */
async function exportRows(filter: Parameters<typeof exportTransactionsCsv>[1] = {}) {
  let csv = '';
  for await (const chunk of exportTransactionsCsv(t.ctx, filter)) csv += chunk;
  return csv
    .trim()
    .split('\r\n')
    .slice(1)
    .map((line) => line.split(';'));
}

describe('filter Transactions by Category group type with Split lines', () => {
  async function seedLoanRepayment() {
    const principal = await category('Principal', 'Loan', 'capital');
    const interest = await category('Interest', 'Bank costs', 'expense');
    const [repayment, fee] = await seed([
      { bookingDate: '2025-10-01', amountMinor: -100000, rawDescription: 'LOAN REPAYMENT' },
      { bookingDate: '2025-10-02', amountMinor: -500, rawDescription: 'ACCOUNT FEE' },
    ]);
    await editClassification(t.ctx, fee!, { categoryId: interest.id });
    await splitTransaction(t.ctx, repayment!, [
      { amountMinor: -90000, categoryId: principal.id },
      { amountMinor: -10000, categoryId: interest.id },
    ]);
    return { repayment: repayment!, fee: fee! };
  }

  it('lists split Transactions with a Split line of that group type, with the matching amount', async () => {
    const { repayment, fee } = await seedLoanRepayment();

    const capital = await listTransactions(t.ctx, { groupType: 'capital' });
    const expense = await listTransactions(t.ctx, { groupType: 'expense' });
    const income = await listTransactions(t.ctx, { groupType: 'income' });

    expect(capital.transactions.map((tx) => [tx.id, tx.matchingSplitAmountMinor])).toEqual([
      [repayment, -90000],
    ]);
    expect(expense.transactions.map((tx) => [tx.id, tx.matchingSplitAmountMinor])).toEqual([
      [fee, null],
      [repayment, -10000],
    ]);
    expect(income.total).toBe(0);
  });

  it('exports only the Split lines of that group type', async () => {
    const { repayment, fee } = await seedLoanRepayment();

    const rows = await exportRows({ groupType: 'expense' });

    expect(rows.map((row) => [row[20], row[5], row[13], row[14]])).toEqual([
      [repayment, '-100.00', 'expense', 'Interest'],
      [fee, '-5.00', 'expense', 'Interest'],
    ]);
  });

  it('matches the Category and the group type on the same Split line', async () => {
    const { repayment } = await seedLoanRepayment();
    const interest = (await getClassification(t.ctx, repayment)).splitLines[1]!.category;

    const page = await listTransactions(t.ctx, { categoryId: interest.id, groupType: 'capital' });
    const rows = await exportRows({ categoryId: interest.id, groupType: 'capital' });

    expect(page.total).toBe(0);
    expect(rows).toEqual([]);
  });

  it('selects only Transactions whose own Category has the type when applying Rules', async () => {
    const { repayment } = await seedLoanRepayment();
    const bank = await createPayee(t.ctx, 'Bank');
    await createRule(t.ctx, {
      name: 'Bank',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'LOAN' }],
      actions: { payeeId: bank.id, categoryId: null, tagIds: [] },
    });

    const preview = await previewApplyRules(t.ctx, { filter: { groupType: 'capital' } });

    expect(preview).toMatchObject({ examined: 0, changedCount: 0 });
    expect((await getClassification(t.ctx, repayment)).payee).toBeNull();
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

  it('exports only the Split lines in the Category of a split Transaction', async () => {
    const { groceries, plain, split } = await seedSplitAndPlain();

    const filtered = await exportRows({ categoryId: groceries.id });
    const unfiltered = await exportRows();

    expect(filtered.map((row) => [row[20], row[5], row[14]])).toEqual([
      [plain, '-45.90', 'Groceries'],
      [split, '-60.00', 'Groceries'],
    ]);
    expect(unfiltered.map((row) => [row[20], row[5], row[14]])).toEqual([
      [plain, '-45.90', 'Groceries'],
      [split, '-60.00', 'Groceries'],
      [split, '-40.00', 'Household'],
    ]);
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

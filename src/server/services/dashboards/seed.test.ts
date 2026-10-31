import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { runWidget } from '../reporting';
import { editClassification } from '../transactions';
import { linkTransfer } from '../transfers';
import { deleteDashboard, getDashboard, listDashboards, seedStarterDashboard } from '.';

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

async function account(
  bankName: string,
  name: string,
  currency: string,
  openingBalanceMinor: number,
): Promise<Account> {
  const bank = await createBank(t.ctx, { name: bankName });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor,
  });
}

/**
 * Today is 2025-04-10, so the last 12 complete months are April 2024 to March 2025.
 * - UBS Current (CHF, opens at 10 000.00): salary 5 000.00 (Jan), groceries -200.00 (Jan),
 *   restaurant -80.00 (Feb), notary -3 000.00 (Capital, Feb), a Transfer of -1 000.00 to
 *   Savings (Feb), an unclassified -50.00 (Mar), and groceries -999.00 before the range.
 * - UBS Savings (CHF, opens at 200 000.00): the Transfer's other side, +1 000.00.
 * - CA Livret (EUR, opens at 1 000.00 EUR), valued at 0.95 CHF/EUR.
 */
async function dataset() {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-04-10T10:00:00Z') });
  const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const capital = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
  const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
  const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
  const restaurants = await createCategory(t.ctx, { groupId: food.id, name: 'Restaurants' });
  const notary = await createCategory(t.ctx, { groupId: capital.id, name: 'Notary' });

  const current = await account('UBS', 'Current', 'CHF', 1_000_000);
  const savings = await account('UBS Savings', 'Savings', 'CHF', 20_000_000);
  const livret = await account('CA', 'Livret', 'EUR', 100_000);
  await seedEurRates(t.ctx, [['2025-04-01', '0.95']]);

  const ids = await seedTransactions(t.ctx.db, current, [
    { bookingDate: '2025-01-25', amountMinor: 500_000 },
    { bookingDate: '2025-01-10', amountMinor: -20_000 },
    { bookingDate: '2025-02-03', amountMinor: -8_000 },
    { bookingDate: '2025-02-15', amountMinor: -300_000 },
    { bookingDate: '2025-02-20', amountMinor: -100_000 },
    { bookingDate: '2025-03-01', amountMinor: -5_000 },
    { bookingDate: '2024-03-31', amountMinor: -99_900 },
  ]);
  const [transferIn] = await seedTransactions(t.ctx.db, savings, [
    { bookingDate: '2025-02-20', amountMinor: 100_000 },
  ]);
  const categories = [salary, groceries, restaurants, notary, null, null, groceries];
  for (const [index, category] of categories.entries()) {
    if (category) await editClassification(t.ctx, ids[index]!, { categoryId: category.id });
  }
  await linkTransfer(t.ctx, { transactionIds: [ids[4]!, transferIn!] });
  return { current, savings, livret };
}

const MONTHS = [
  '2024-04',
  '2024-05',
  '2024-06',
  '2024-07',
  '2024-08',
  '2024-09',
  '2024-10',
  '2024-11',
  '2024-12',
  '2025-01',
  '2025-02',
  '2025-03',
];

describe('the starter Dashboard', () => {
  it('is seeded once, ever, by the system actor', async () => {
    expect(await seedStarterDashboard(t.ctx)).toBe(true);
    expect(await seedStarterDashboard(t.ctx)).toBe(false);

    const [dashboard, ...others] = await listDashboards(t.ctx);
    expect(others).toEqual([]);
    expect(dashboard!.name).toBe('Overview');
    const { widgets } = await getDashboard(t.ctx, dashboard!.id);
    expect(widgets.map((w) => [w.name, w.visualisation])).toEqual([
      ['Income vs. expense', 'stacked_bar'],
      ['Net cash flow', 'line'],
      ['Spending by Category', 'stacked_bar'],
      ['Account balances in CHF', 'table'],
    ]);
    const [entry] = await listHistory(t.ctx, { entityType: 'dashboard' });
    expect(entry).toMatchObject({ actorType: 'system' });

    await deleteDashboard(t.ctx, dashboard!.id);
    expect(await seedStarterDashboard(t.ctx)).toBe(false);
    expect(await listDashboards(t.ctx)).toEqual([]);
  });

  it('shows the expected figures on a seeded dataset', async () => {
    const { current, savings, livret } = await dataset();
    await seedStarterDashboard(t.ctx);
    const [dashboard] = await listDashboards(t.ctx);
    const widgets = (await getDashboard(t.ctx, dashboard!.id)).widgets;
    const [incomeExpense, netCashFlow, spending, balances] = await Promise.all(
      widgets.map((widget) => runWidget(t.ctx, widget.id)),
    );

    // Income vs. expense: no Capital, no Transfer, no unclassified.
    expect(incomeExpense!.rows.map((row) => row.key)).toEqual(MONTHS);
    expect(incomeExpense!.columns.map((column) => column.key)).toEqual(['income', 'expense']);
    expect(incomeExpense!.cells[9]).toEqual([500_000, -20_000]);
    expect(incomeExpense!.cells[10]).toEqual([null, -8_000]);
    expect(incomeExpense!.columnTotals).toEqual([500_000, -28_000]);

    // Net cash flow: Capital and unclassified in, Transfers out.
    expect(netCashFlow!.rows.map((row) => row.key)).toEqual(MONTHS);
    expect(netCashFlow!.rowTotals.slice(9)).toEqual([480_000, -308_000, -5_000]);
    expect(netCashFlow!.total).toBe(167_000);

    // Spending by Category over time: month × Category (story 108).
    expect(spending!.rows.map((row) => row.key)).toEqual(MONTHS);
    expect(spending!.columns.map((column) => column.label)).toEqual([
      'Food › Groceries',
      'Food › Restaurants',
    ]);
    expect(spending!.cells[9]).toEqual([-20_000, null]);
    expect(spending!.cells[10]).toEqual([null, -8_000]);
    expect(spending!.columnTotals).toEqual([-20_000, -8_000]);

    // Account balances today, in CHF.
    expect(balances!.rows.map((row) => [row.key, row.label])).toEqual([
      [livret.id, 'CA · Livret'],
      [current.id, 'UBS · Current'],
      [savings.id, 'UBS Savings · Savings'],
    ]);
    expect(balances!.rowTotals).toEqual([95_000, 967_100, 20_100_000]);
    expect(balances!.total).toBe(21_162_100);
    expect(balances!.unconvertedCount).toBe(0);
  });
});

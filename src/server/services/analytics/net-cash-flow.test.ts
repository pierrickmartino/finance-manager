import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { listCellTransactions } from '../reporting';
import { linkTransfer, transactionSide } from '../transfers';

/** Analytics' Net cash flow line (spec #170, user stories 27-29; ticket #173). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. A salary in January and March (to date), groceries in February, a
 * property purchase (Capital) in February, an uncategorised payment in March, and a Transfer
 * between the two Accounts in February that must count nowhere.
 */
async function dataset(): Promise<void> {
  const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const capital = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
  const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
  const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
  const property = await createCategory(t.ctx, { groupId: capital.id, name: 'Property' });
  const as = (category: Category) => ({ categoryId: category.id });

  const ubs = await seedAccount(t.ctx, 'UBS');
  const savings = await seedAccount(t.ctx, 'Savings');
  const [, , , , , transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-03-10', amountMinor: 300_000, classify: as(salary) },
    { bookingDate: '2025-02-05', amountMinor: -40_000, classify: as(groceries) },
    { bookingDate: '2025-02-15', amountMinor: -500_000, classify: as(property) },
    { bookingDate: '2025-03-12', amountMinor: -7_000 },
    { bookingDate: '2025-02-20', amountMinor: -250_000 },
  ]);
  const [transferIn] = await seedClassified(t.ctx, savings, [
    { bookingDate: '2025-02-20', amountMinor: 250_000 },
  ]);
  await linkTransfer(t.ctx, {
    sides: [transactionSide(transferOut!), transactionSide(transferIn!)],
  });
}

describe('Net cash flow', () => {
  it('has one point per month of the window, Capital included and the Transfer left out', async () => {
    fixToday('2025-03-20');
    await dataset();

    const line = await loadSection(t.ctx, 'month', 'netCashFlow');

    expect(line.isEmpty).toBe(false);
    expect(line.points.map((point) => point.key)).toEqual([
      ...['2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'],
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    expect(line.points.map((point) => point.isToDate)).toEqual([
      ...Array<boolean>(11).fill(false),
      true,
    ]);
    // February: groceries -400.00 and property -5,000.00; the Transfer adds nothing. March to
    // date: salary 3,000.00 and an uncategorised -70.00.
    expect(line.points.map((point) => point.value)).toEqual([
      ...Array<null>(9).fill(null),
      600_000,
      -540_000,
      293_000,
    ]);
  });

  it('follows the Quarter and Year views, Capital in and the Transfer out in each', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = await loadSection(t.ctx, 'quarter', 'netCashFlow');
    const years = await loadSection(t.ctx, 'year', 'netCashFlow');

    expect(quarters.points.map((point) => point.label)).toEqual([
      ...['Q2 2023', 'Q3 2023', 'Q4 2023', 'Q1 2024'],
      ...['Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025'],
    ]);
    expect(quarters.points.map((point) => point.value)).toEqual([
      ...Array<null>(7).fill(null),
      353_000,
    ]);
    expect(quarters.points.at(-1)?.isToDate).toBe(true);
    expect(years.points.map((point) => point.key)).toEqual([
      ...['2020', '2021', '2022', '2023', '2024', '2025'],
    ]);
    expect(years.points.map((point) => point.value)).toEqual([
      ...Array<null>(5).fill(null),
      353_000,
    ]);
    expect(years.points.at(-1)?.isToDate).toBe(true);
  });

  it('opens a Drill-down behind every point whose Transactions add up to it', async () => {
    fixToday('2025-03-20');
    await dataset();

    for (const view of ['month', 'quarter', 'year'] as const) {
      const line = await loadSection(t.ctx, view, 'netCashFlow');
      for (const point of line.points) {
        const page = await listCellTransactions(t.ctx, point.drill.query, point.drill.cell);
        expect(page.value).toBe(point.value);
      }
    }
  });

  it('is empty when no Transaction falls in the window', async () => {
    fixToday('2025-03-20');

    const line = await loadSection(t.ctx, 'month', 'netCashFlow');

    expect(line.isEmpty).toBe(true);
    expect(line.points).toHaveLength(12);
    expect(line.points.every((point) => point.value === null)).toBe(true);
  });
});

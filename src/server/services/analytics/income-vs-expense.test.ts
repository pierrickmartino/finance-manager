import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cellValues,
  fixToday,
  loadSection,
  seedAccount,
  seedClassified,
} from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { listCellTransactions } from '../reporting';
import { splitTransaction } from '../transactions';
import { linkTransfer, transactionSide } from '../transfers';
import type { FigureRow } from '.';

/** Analytics' Income vs. expense table (spec #170, user stories 34-37, 39, 41-44). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. A salary in January, February and March (to date); groceries with a
 * refund and an EUR purchase in January; a split purchase in February, part groceries and part
 * property (Capital); a property purchase in February; groceries in March; groceries in
 * February 2024, before the Month window; and a Transfer out to the EUR Account.
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
  const ca = await seedAccount(t.ctx, 'CA', 'EUR');
  await seedEurRates(t.ctx, [['2025-01-10', '0.9400']]);

  const [, , , , , , split, , , transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-02-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-03-10', amountMinor: 300_000, classify: as(salary) },
    { bookingDate: '2025-01-10', amountMinor: -12_000, classify: as(groceries) },
    { bookingDate: '2025-01-20', amountMinor: 2_000, classify: as(groceries) },
    { bookingDate: '2025-03-05', amountMinor: -5_000, classify: as(groceries) },
    { bookingDate: '2025-02-03', amountMinor: -30_000 },
    { bookingDate: '2025-02-15', amountMinor: -500_000, classify: as(property) },
    { bookingDate: '2024-02-10', amountMinor: -999, classify: as(groceries) },
    { bookingDate: '2025-02-20', amountMinor: -100_000, classify: as(salary) },
  ]);
  await splitTransaction(t.ctx, split!, [
    { amountMinor: -20_000, categoryId: groceries.id },
    { amountMinor: -10_000, categoryId: property.id },
  ]);
  const [, transferIn] = await seedClassified(t.ctx, ca, [
    // EUR -100.00 at 0.94: CHF -94.00.
    { bookingDate: '2025-01-11', amountMinor: -10_000, classify: as(groceries) },
    { bookingDate: '2025-02-20', amountMinor: 100_000 },
  ]);
  await linkTransfer(t.ctx, {
    sides: [transactionSide(transferOut!), transactionSide(transferIn!)],
  });
}

describe('Income vs. expense', () => {
  it('has a row per type, then Net and Net incl. Capital, with Total and complete-period Average', async () => {
    fixToday('2025-03-20');
    await dataset();

    const table = await loadSection(t.ctx, 'month', 'incomeVsExpense');

    expect(table.periods.map((period) => period.key)).toEqual([
      ...['2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'],
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    expect(table.periods.at(-1)?.isToDate).toBe(true);
    expect(table.isEmpty).toBe(false);
    const empty = Array<null>(9).fill(null);
    // Groceries in January: -120.00 + 20.00 refund + EUR -100.00 at 0.94 = -194.00. The split
    // purchase counts -200.00 under Groceries and -100.00 under Property. The Transfer counts
    // nowhere. Average divides the 11 complete months only, rounding half away from zero.
    expect(
      table.rows.map((row) => [row.label, cellValues(row), row.total.value, row.average.value]),
    ).toEqual([
      ['Income', [...empty, 600_000, 600_000, 300_000], 1_500_000, 109_091],
      ['Expense', [...empty, -19_400, -20_000, -5_000], -44_400, -3_582],
      ['Capital', [...empty, null, -510_000, null], -510_000, -46_364],
      ['Net (income − expense)', [...empty, 580_600, 580_000, 295_000], 1_455_600, 105_509],
      ['Net incl. Capital', [...empty, 580_600, 70_000, 295_000], 945_600, 59_145],
    ]);
  });

  it('reads the window of the Period view: Quarter and Year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = await loadSection(t.ctx, 'quarter', 'incomeVsExpense');
    const years = await loadSection(t.ctx, 'year', 'incomeVsExpense');

    const expense = (rows: FigureRow[]) => rows.find((row) => row.key === 'expense')!;
    expect(quarters.periods.map((period) => period.key)).toEqual([
      ...['2023-Q2', '2023-Q3', '2023-Q4', '2024-Q1'],
      ...['2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1'],
    ]);
    // February 2024 is in the Quarter and Year windows; the current period is to date.
    expect(cellValues(expense(quarters.rows))).toEqual([
      null,
      null,
      null,
      -999,
      null,
      null,
      null,
      -44_400,
    ]);
    expect(expense(quarters.rows).total.value).toBe(-45_399);
    // -9.99 over 7 complete quarters: -1.427, rounded to -1.43.
    expect(expense(quarters.rows).average.value).toBe(-143);
    expect(years.periods.map((period) => period.label)).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
    expect(cellValues(expense(years.rows))).toEqual([null, null, null, null, -999, -44_400]);
    // -9.99 over 5 complete years: -1.998, rounded to -2.00.
    expect(expense(years.rows).average.value).toBe(-200);
  });

  it('opens a Drill-down behind every figure whose Transactions work out to it', async () => {
    fixToday('2025-03-20');
    await dataset();

    const table = await loadSection(t.ctx, 'month', 'incomeVsExpense');

    const figures = table.rows.flatMap((row) => [...row.cells, row.total, row.average]);
    expect(figures).toHaveLength(5 * 14);
    for (const figure of figures) {
      const page = await listCellTransactions(t.ctx, figure.drill.query, figure.drill.cell);
      expect(page.value).toBe(figure.value);
    }
  });

  it('is empty when no Transaction falls in the window', async () => {
    fixToday('2025-03-20');

    const table = await loadSection(t.ctx, 'year', 'incomeVsExpense');

    expect(table.isEmpty).toBe(true);
    expect(table.rows.every((row) => row.total.value === null)).toBe(true);
  });
});

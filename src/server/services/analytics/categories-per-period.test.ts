import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { listCellTransactions } from '../reporting';
import { splitTransaction } from '../transactions';
import { linkTransfer, transactionSide } from '../transfers';
import { loadAnalytics, type CategoriesPerPeriod, type FigureRow } from '.';
import type { PeriodView } from '@/lib/analytics/period-view';

/** Analytics' Categories per period table (spec #170, ticket #172). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. Groups are created Capital first so the table's Income, Expense,
 * Capital order cannot come from creation order. Salary in January and March (to date); a
 * Bonus with nothing booked; groceries with a refund and an EUR purchase in January; a split
 * purchase in February, part groceries and part property; a restaurant meal in March; groceries
 * in February 2024, before the Month window; a Transfer out to the EUR Account; and a Travel
 * group whose only Category has nothing booked.
 */
async function dataset(): Promise<void> {
  const capital = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
  const travel = await createCategoryGroup(t.ctx, { name: 'Travel', type: 'expense' });
  const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
  await createCategory(t.ctx, { groupId: income.id, name: 'Bonus' });
  const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
  const restaurants = await createCategory(t.ctx, { groupId: food.id, name: 'Restaurants' });
  await createCategory(t.ctx, { groupId: travel.id, name: 'Hotels' });
  const property = await createCategory(t.ctx, { groupId: capital.id, name: 'Property' });
  const as = (category: Category) => ({ categoryId: category.id });

  const ubs = await seedAccount(t.ctx, 'UBS');
  const ca = await seedAccount(t.ctx, 'CA', 'EUR');
  await seedEurRates(t.ctx, [['2025-01-10', '0.9400']]);

  const [, , , , split, , , transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-03-10', amountMinor: 300_000, classify: as(salary) },
    { bookingDate: '2025-01-10', amountMinor: -12_000, classify: as(groceries) },
    { bookingDate: '2025-01-20', amountMinor: 2_000, classify: as(groceries) },
    { bookingDate: '2025-02-03', amountMinor: -30_000 },
    { bookingDate: '2025-03-05', amountMinor: -4_500, classify: as(restaurants) },
    { bookingDate: '2024-02-10', amountMinor: -999, classify: as(groceries) },
    { bookingDate: '2025-02-20', amountMinor: -100_000, classify: as(groceries) },
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

/** The section at a view, once every section has loaded so no query outlives the test. */
async function categoriesAt(view: PeriodView): Promise<CategoriesPerPeriod> {
  const { sections } = loadAnalytics(t.ctx, view);
  await Promise.allSettled(Object.values(sections));
  return sections.categoriesPerPeriod;
}

const values = (row: FigureRow) => row.cells.map((cell) => cell.value);
const figuresOf = (table: CategoriesPerPeriod) =>
  table.groups.flatMap((group) =>
    [group.subtotal, ...group.categories].flatMap((row) => [...row.cells, row.total, row.average]),
  );

describe('Categories per period', () => {
  it('groups the Categories with an amount under their group, Income then Expense then Capital, each with a subtotal', async () => {
    fixToday('2025-03-20');
    await dataset();

    const table = await categoriesAt('month');

    expect(table.periods).toHaveLength(12);
    expect(table.periods.at(-1)?.isToDate).toBe(true);
    expect(table.isEmpty).toBe(false);
    // Bonus and Hotels have nothing booked, so they are hidden, and so is the Travel group.
    expect(
      table.groups.map((group) => [
        group.name,
        group.type,
        group.categories.map((row) => row.label),
      ]),
    ).toEqual([
      ['Income', 'income', ['Salary']],
      ['Food', 'expense', ['Groceries', 'Restaurants']],
      ['Capital', 'capital', ['Property']],
    ]);
    const empty = Array<null>(9).fill(null);
    // Groceries in January: -120.00 + 20.00 refund + EUR -100.00 at 0.94 = -194.00. The split
    // purchase counts -200.00 under Groceries and -100.00 under Property; the Transfer counts
    // nowhere. Average divides the 11 complete months only, rounding half away from zero.
    const food = table.groups[1]!;
    expect(
      [...food.categories, food.subtotal].map((row) => [
        row.label,
        values(row),
        row.total.value,
        row.average.value,
      ]),
    ).toEqual([
      ['Groceries', [...empty, -19_400, -20_000, null], -39_400, -3_582],
      ['Restaurants', [...empty, null, null, -4_500], -4_500, null],
      ['Food', [...empty, -19_400, -20_000, -4_500], -43_900, -3_582],
    ]);
    expect(table.groups[0]!.subtotal.total.value).toBe(900_000);
    expect(table.groups[2]!.subtotal.total.value).toBe(-10_000);
  });

  it('reads the window of the Period view: Quarter and Year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = await categoriesAt('quarter');
    const years = await categoriesAt('year');

    const groceries = (table: CategoriesPerPeriod) => table.groups[1]!.categories[0]!;
    // February 2024 is in the Quarter and Year windows; the current period is to date.
    expect(values(groceries(quarters))).toEqual([
      null,
      null,
      null,
      -999,
      null,
      null,
      null,
      -39_400,
    ]);
    expect(groceries(quarters).total.value).toBe(-40_399);
    // -9.99 over 7 complete quarters: -1.427, rounded to -1.43.
    expect(groceries(quarters).average.value).toBe(-143);
    expect(values(groceries(years))).toEqual([null, null, null, null, -999, -39_400]);
    expect(years.groups[1]!.subtotal.total.value).toBe(-44_899);
  });

  it.each(['month', 'quarter', 'year'] as const)(
    'opens a Drill-down behind every cell, subtotal, Total and Average that sums to it (%s)',
    async (view) => {
      fixToday('2025-03-20');
      await dataset();

      const table = await categoriesAt(view);

      const figures = figuresOf(table);
      // 3 subtotals and 4 Categories, each with a cell per period then Total and Average.
      expect(figures).toHaveLength(7 * (table.periods.length + 2));
      for (const figure of figures) {
        const page = await listCellTransactions(t.ctx, figure.drill.query, figure.drill.cell);
        expect(page.value).toBe(figure.value);
      }
    },
  );

  it('is empty when no Transaction falls in the window', async () => {
    fixToday('2025-03-20');
    await dataset();
    vi.setSystemTime(new Date('2035-03-20T09:00:00Z'));

    const table = await categoriesAt('year');

    expect(table.isEmpty).toBe(true);
    expect(table.groups).toEqual([]);
  });
});

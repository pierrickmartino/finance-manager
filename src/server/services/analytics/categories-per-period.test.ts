import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixToday,
  labels,
  linkedValues,
  loadSection,
  openDrill,
  originOf,
  seedAccount,
  seedClassified,
} from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { splitTransaction } from '../transactions';
import { linkTransfer, transactionSide } from '../transfers';
import { readCard } from '@/lib/reporting/card';

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

const money = String;

describe('Categories per period', () => {
  it('is a heatmap card of each group subtotal then its Categories with an amount, Income then Expense then Capital', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, 'month', 'categoriesPerPeriod');
    const data = card.data!;

    expect(card.name).toBe('Categories per period');
    expect(card.isEmpty).toBe(false);
    expect(readCard(card, money).kind).toBe('grid');
    expect(data.columns).toHaveLength(12);
    expect(data.columns.at(-1)).toMatchObject({ label: 'Mar 2025', isPartial: true });
    // Bonus and Hotels have nothing booked, so they are hidden, and so is the Travel group.
    expect(labels(data.rows)).toEqual([
      'Income',
      'Income › Salary',
      'Food',
      'Food › Groceries',
      'Food › Restaurants',
      'Capital',
      'Capital › Property',
    ]);
    const empty = Array<null>(9).fill(null);
    // Groceries in January: -120.00 + 20.00 refund + EUR -100.00 at 0.94 = -194.00. The split
    // purchase counts -200.00 under Groceries and -100.00 under Property; the Transfer counts
    // nowhere.
    expect(data.rows.slice(2, 5).map((_, r) => [data.cells[r + 2], data.rowTotals[r + 2]])).toEqual(
      [
        [[...empty, -19_400, -20_000, -4_500], -43_900],
        [[...empty, -19_400, -20_000, null], -39_400],
        [[...empty, null, null, -4_500], -4_500],
      ],
    );
    expect(data.rowTotals[0]).toBe(900_000);
    expect(data.rowTotals[5]).toBe(-10_000);
    expect(data.total).toBe(846_100);
  });

  it('outlines its rows as a tree: a section per type, each group subtotal over its Categories', async () => {
    fixToday('2025-03-20');
    await dataset();

    const data = (await loadSection(t.ctx, 'month', 'categoriesPerPeriod')).data!;

    // Row indexes into data.rows; a Category keeps its whole label there and its own name here.
    expect(data.rowTree).toEqual({
      sections: [
        { label: 'Income', groups: [{ row: 0, children: [{ row: 1, label: 'Salary' }] }] },
        {
          label: 'Expense',
          groups: [
            {
              row: 2,
              children: [
                { row: 3, label: 'Groceries' },
                { row: 4, label: 'Restaurants' },
              ],
            },
          ],
        },
        { label: 'Capital', groups: [{ row: 5, children: [{ row: 6, label: 'Property' }] }] },
      ],
    });
  });

  it('leads with its largest row, as a Dashboard heatmap does', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, 'month', 'categoriesPerPeriod');
    // Income and Expense net to a total Income isn't a share of: the card names the largest row.
    // Income is 900'000 of the rows' 1'907'800 in all, by magnitude: 47%.
    expect(readCard(card, money).lead).toMatchObject({
      headline: 'Income leads',
      detail: '900000',
    });
  });

  it('reads the window of the Period view: Quarter and Year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = (await loadSection(t.ctx, 'quarter', 'categoriesPerPeriod')).data!;
    const years = (await loadSection(t.ctx, 'year', 'categoriesPerPeriod')).data!;

    const groceries = 3;
    // February 2024 is in the Quarter and Year windows; the current period is to date.
    expect(quarters.cells[groceries]).toEqual([null, null, null, -999, null, null, null, -39_400]);
    expect(quarters.rowTotals[groceries]).toBe(-40_399);
    expect(years.cells[groceries]).toEqual([null, null, null, null, -999, -39_400]);
    expect(years.rowTotals[2]).toBe(-44_899);
  });

  it.each(['month', 'quarter', 'year'] as const)(
    'opens a Drill-down behind every cell, subtotal and Total that sums to it (%s)',
    async (view) => {
      fixToday('2025-03-20');
      await dataset();

      const data = (await loadSection(t.ctx, view, 'categoriesPerPeriod')).data!;

      const values = linkedValues(data);
      // 3 subtotals and 4 Categories, each with a cell per period then Total; then the column
      // totals and the total.
      const periods = data.columns.length;
      expect(values).toHaveLength(7 * (periods + 1) + periods + 1);
      for (const { value, href } of values) {
        expect(originOf(href)).toEqual({ kind: 'analytics', period: view });
        expect((await openDrill(t.ctx, href)).value).toBe(value);
      }
    },
  );

  it('is empty when no Transaction falls in the window', async () => {
    fixToday('2025-03-20');
    await dataset();
    vi.setSystemTime(new Date('2035-03-20T09:00:00Z'));

    const card = await loadSection(t.ctx, 'year', 'categoriesPerPeriod');

    expect(card.isEmpty).toBe(true);
    expect(card.data!.rows).toEqual([]);
  });
});

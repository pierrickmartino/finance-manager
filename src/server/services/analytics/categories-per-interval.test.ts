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
  seedEarlyStart,
} from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/periods';
import { presetPeriod } from '@/lib/analytics/period';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { splitTransaction } from '../transactions';
import { linkTransfer, transactionSide } from '../transfers';
import { readCard } from '@/lib/reporting/card';

/** Analytics' Categories per interval table (spec #170, ticket #172). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. Groups are created Capital first so the table's Income, Expense,
 * Capital order cannot come from creation order. Salary in January and March (to date); a
 * Bonus with nothing booked; groceries with a refund and an EUR purchase in January; a split
 * purchase in February, part groceries and part property; a restaurant meal in March; groceries
 * in February 2024, before Rolling 12 months; a Transfer out to the EUR Account; and a Travel
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
  await seedEarlyStart(t.ctx, ubs);
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

describe('Categories per interval', () => {
  it('is a heatmap card of each group subtotal then its Categories with an amount, Income then Expense then Capital', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'categoriesPerInterval');
    const data = card.data!;

    expect(card.name).toBe('Categories per interval');
    expect(card.isEmpty).toBe(false);
    expect(readCard(card, money).kind).toBe('grid');
    expect(data.columns).toHaveLength(13);
    // Cut short at the Period's start, and to date.
    expect(data.columns[0]).toMatchObject({ label: 'Mar 2024', isPartial: true });
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
    const empty = Array<null>(10).fill(null);
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

    const data = (await loadSection(t.ctx, MONTHLY, 'categoriesPerInterval')).data!;

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

    const card = await loadSection(t.ctx, MONTHLY, 'categoriesPerInterval');
    // Income and Expense net to a total Income isn't a share of: the card names the largest row.
    // Income is 900'000 of the rows' 1'907'800 in all, by magnitude: 47%.
    expect(readCard(card, money).lead).toMatchObject({
      headline: 'Income leads',
      detail: '900000',
    });
  });

  it('reads the Period by quarter and by year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = (await loadSection(t.ctx, QUARTERLY, 'categoriesPerInterval')).data!;
    const years = (await loadSection(t.ctx, YEARLY, 'categoriesPerInterval')).data!;

    const groceries = 3;
    // February 2024 is in both Periods (not in Rolling 12 months); the current interval is to date.
    expect(quarters.cells[groceries]).toEqual([-999, null, null, null, -39_400]);
    expect(quarters.rowTotals[groceries]).toBe(-40_399);
    expect(years.cells[groceries]).toEqual([null, null, null, -999, -39_400]);
    expect(years.rowTotals[2]).toBe(-44_899);
  });

  it.each([MONTHLY, QUARTERLY, YEARLY])(
    'opens a Drill-down behind every cell, subtotal and Total that sums to it ($preset)',
    async (view) => {
      fixToday('2025-03-20');
      await dataset();

      const data = (await loadSection(t.ctx, view, 'categoriesPerInterval')).data!;

      const values = linkedValues(data);
      // 3 subtotals and 4 Categories, each with a cell per interval then Total; then the column
      // totals and the total.
      const intervals = data.columns.length;
      expect(values).toHaveLength(7 * (intervals + 1) + intervals + 1);
      for (const { value, href } of values) {
        expect(originOf(href)).toEqual({
          kind: 'analytics',
          page: { period: view, cardPeriods: {} },
        });
        expect((await openDrill(t.ctx, href)).value).toBe(value);
      }
    },
  );

  it('pinned, reads its own Period by year while the page reads Rolling 90 days by month', async () => {
    fixToday('2025-03-20');
    await dataset();
    const page = presetPeriod('rolling-90-days');
    const pins = { 'categories-per-interval': 'this-year-and-last-4' } as const;

    const card = await loadSection(t.ctx, page, 'categoriesPerInterval', pins);
    const data = card.data!;

    expect(card.isPinned).toBe(true);
    expect(card.reading).toMatchObject({
      period: presetPeriod('this-year-and-last-4'),
      from: '2021-01-01',
      grain: 'year',
    });
    expect(data.columns.map((column) => [column.label, column.isPartial])).toEqual([
      ['2021', false],
      ['2022', false],
      ['2023', false],
      ['2024', false],
      ['2025', true],
    ]);
    const groceries = labels(data.rows).indexOf('Food › Groceries');
    // February 2024's groceries are outside the page's 90 days, inside the pin.
    expect(data.cells[groceries]).toEqual([null, null, null, -999, -39_400]);
    expect(data.rowTotals[groceries]).toBe(-40_399);
    for (const { value, href } of linkedValues(data)) {
      expect(originOf(href)).toEqual({
        kind: 'analytics',
        page: { period: page, cardPeriods: pins },
      });
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
  });

  it('pinned, sets apart its own partial first and to-date last Intervals', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, YEARLY, 'categoriesPerInterval', {
      'categories-per-interval': 'rolling-60-days',
    });

    expect(card.data!.columns.map((column) => [column.label, column.isPartial])).toEqual([
      ['Jan 2025', true],
      ['Feb 2025', false],
      ['Mar 2025', true],
    ]);
  });

  it('unpinned, follows the page Period and says so', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, QUARTERLY, 'categoriesPerInterval', {
      'income-vs-expense': 'rolling-60-days',
    });

    expect(card.isPinned).toBe(false);
    expect(card.reading).toMatchObject({ period: QUARTERLY, grain: 'quarter' });
    expect(card.data!.columns).toHaveLength(5);
  });

  it('pinned, names its own Period in words for its sentence; unpinned, names none', async () => {
    fixToday('2025-03-20');
    await dataset();

    const pinned = await loadSection(t.ctx, QUARTERLY, 'categoriesPerInterval', {
      'categories-per-interval': 'this-year-and-last-4',
    });
    const unpinned = await loadSection(t.ctx, QUARTERLY, 'categoriesPerInterval');

    expect(pinned.periodName).toBe('This year and last 4');
    expect(unpinned.periodName).toBeNull();
  });

  it('is empty when no Transaction falls in the Period', async () => {
    fixToday('2025-03-20');
    await dataset();
    vi.setSystemTime(new Date('2035-03-20T09:00:00Z'));

    const card = await loadSection(t.ctx, YEARLY, 'categoriesPerInterval');

    expect(card.isEmpty).toBe(true);
    expect(card.data!.rows).toEqual([]);
  });
});

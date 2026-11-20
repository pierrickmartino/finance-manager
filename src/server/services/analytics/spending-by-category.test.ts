import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cellValues,
  fixToday,
  loadSection,
  seedAccount,
  seedClassified,
  type ClassifiedRow,
} from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup } from '../categories';
import { listCellTransactions } from '../reporting';

/** Analytics' Spending by Category stacked bar (spec #170, user stories 30-33; ticket #174). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/** Expense Categories with their bookings in the Month window, and a salary that never counts. */
const SPENDING: Record<string, [string, number][]> = {
  Rent: [
    ['2025-01-05', -50_000],
    ['2025-03-05', -50_000],
  ],
  Groceries: [
    ['2025-01-12', -40_000],
    ['2025-02-12', -50_000],
  ],
  Travel: [['2025-02-08', -80_000]],
  Health: [['2025-01-18', -70_000]],
  Insurance: [['2025-02-01', -60_000]],
  Dining: [
    ['2025-01-22', -30_000],
    ['2025-02-22', -20_000],
  ],
  Phone: [['2025-03-02', -40_000]],
  // -450.00 with a 150.00 refund: 300.00, so it ranks below Phone (400.00), not above.
  Books: [
    ['2025-02-14', -45_000],
    ['2025-02-16', 15_000],
  ],
  Gifts: [['2025-01-25', -25_000]],
  Hobbies: [
    ['2025-01-28', -12_000],
    ['2025-03-08', -8_000],
  ],
};

/** Today is 20 March 2025. Seeds the Categories under one expense group, plus a salary. */
async function dataset(names = Object.keys(SPENDING)): Promise<void> {
  const food = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const pay = await createCategoryGroup(t.ctx, { name: 'Pay', type: 'income' });
  const salary = await createCategory(t.ctx, { groupId: pay.id, name: 'Salary' });
  const ubs = await seedAccount(t.ctx, 'UBS');
  const rows: ClassifiedRow[] = [
    { bookingDate: '2025-01-25', amountMinor: 900_000, classify: { categoryId: salary.id } },
  ];
  for (const name of names) {
    const category = await createCategory(t.ctx, { groupId: food.id, name });
    for (const [bookingDate, amountMinor] of SPENDING[name]!) {
      rows.push({
        bookingDate,
        amountMinor,
        rawDescription: `${name} ${bookingDate}`,
        classify: { categoryId: category.id },
      });
    }
  }
  await seedClassified(t.ctx, ubs, rows);
}

const empty = Array<null>(9).fill(null);

describe('Spending by Category', () => {
  it('stacks the 8 largest Expense Categories over the window by name and folds the rest into Other', async () => {
    fixToday('2025-03-20');
    await dataset();

    const chart = await loadSection(t.ctx, 'month', 'spendingByCategory');

    expect(chart.isEmpty).toBe(false);
    expect(chart.periods).toHaveLength(12);
    expect(chart.periods.at(-1)).toMatchObject({ key: '2025-03', isToDate: true });
    expect(
      chart.series.map((series) => [series.label, series.isOther, series.total.value]),
    ).toEqual([
      ['Living › Rent', false, -100_000],
      ['Living › Groceries', false, -90_000],
      ['Living › Travel', false, -80_000],
      ['Living › Health', false, -70_000],
      ['Living › Insurance', false, -60_000],
      ['Living › Dining', false, -50_000],
      ['Living › Phone', false, -40_000],
      ['Living › Books', false, -30_000],
      ['Other', true, -45_000],
    ]);
    const rent = chart.series[0]!;
    expect(cellValues(rent)).toEqual([...empty, -50_000, null, -50_000]);
    // Gifts and Hobbies, folded: January -250.00 and -120.00, March -80.00.
    const other = chart.series.at(-1)!;
    expect(cellValues(other)).toEqual([...empty, -37_000, null, -8_000]);
  });

  it("opens a Drill-down behind every segment, Other's covering every folded Category", async () => {
    fixToday('2025-03-20');
    await dataset();

    const chart = await loadSection(t.ctx, 'month', 'spendingByCategory');

    const figures = chart.series.flatMap((series) => [...series.cells, series.total]);
    expect(figures).toHaveLength(9 * 13);
    for (const figure of figures) {
      const page = await listCellTransactions(t.ctx, figure.drill.query, figure.drill.cell);
      expect(page.value).toBe(figure.value);
    }
    const other = chart.series.at(-1)!;
    const page = await listCellTransactions(t.ctx, other.total.drill.query, other.total.drill.cell);
    expect(page.sumChfMinor).toBe(-45_000);
    expect(page.transactions.map((row) => row.rawDescription).sort()).toEqual([
      'Gifts 2025-01-25',
      'Hobbies 2025-01-28',
      'Hobbies 2025-03-08',
    ]);
  });

  it('has no Other with 8 Expense Categories or fewer', async () => {
    fixToday('2025-03-20');
    await dataset(['Rent', 'Groceries', 'Books']);

    const chart = await loadSection(t.ctx, 'quarter', 'spendingByCategory');

    expect(chart.periods.at(-1)).toMatchObject({ key: '2025-Q1', isToDate: true });
    expect(chart.series.map((series) => series.label)).toEqual([
      'Living › Rent',
      'Living › Groceries',
      'Living › Books',
    ]);
    expect(cellValues(chart.series[0]!)).toEqual([...Array<null>(7).fill(null), -100_000]);
  });

  it('is empty when no expense falls in the window', async () => {
    fixToday('2025-03-20');

    const chart = await loadSection(t.ctx, 'year', 'spendingByCategory');

    expect(chart.isEmpty).toBe(true);
    expect(chart.series).toEqual([]);
    expect(chart.periods).toHaveLength(6);
  });
});

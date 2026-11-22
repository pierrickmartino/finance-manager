import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import type { KeyFigure, KeyFigureId } from './key-figures';

/** Key figures' sparklines (spec #225, user stories 24-27; ticket #230). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

async function categories() {
  const pay = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const living = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const wealth = await createCategoryGroup(t.ctx, { name: 'Wealth', type: 'capital' });
  const as = (category: Category) => ({ categoryId: category.id });
  return {
    salary: as(await createCategory(t.ctx, { groupId: pay.id, name: 'Salary' })),
    groceries: as(await createCategory(t.ctx, { groupId: living.id, name: 'Groceries' })),
    property: as(await createCategory(t.ctx, { groupId: wealth.id, name: 'Property' })),
  };
}

/**
 * Today is 20 May 2025. Salaries of 800.00 in December 2024, 500.00 in February, 1,000.00 in
 * April and 1,200.00 in May; groceries of 400.00 in February, 200.00 in April, and 300.00 in May
 * with a 50.00 refund; a property purchase (Capital) in April, which is neither.
 */
async function dataset(): Promise<void> {
  const { salary, groceries, property } = await categories();
  const ubs = await seedAccount(t.ctx, 'UBS');
  await seedClassified(t.ctx, ubs, [
    { bookingDate: '2024-12-20', amountMinor: 80_000, classify: salary },
    { bookingDate: '2025-02-25', amountMinor: 50_000, classify: salary },
    { bookingDate: '2025-02-11', amountMinor: -40_000, classify: groceries },
    { bookingDate: '2025-04-15', amountMinor: 100_000, classify: salary },
    { bookingDate: '2025-04-20', amountMinor: -20_000, classify: groceries },
    { bookingDate: '2025-04-22', amountMinor: -60_000, classify: property },
    { bookingDate: '2025-05-05', amountMinor: -30_000, classify: groceries },
    { bookingDate: '2025-05-12', amountMinor: 5_000, classify: groceries },
    { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
  ]);
}

const byId = (figures: readonly KeyFigure[]) =>
  Object.fromEntries(figures.map((figure) => [figure.id, figure])) as Record<
    KeyFigureId,
    KeyFigure
  >;

const values = (figure: KeyFigure) => figure.sparkline.map((point) => point.value);
const partials = (figure: KeyFigure) => figure.sparkline.map((point) => point.isPartial);

describe('Key figures sparklines', () => {
  it('in Month, give Income, Expense and Profit a point per month of the window, May partial', async () => {
    fixToday('2025-05-20');
    await dataset();

    const { income, expense, profit } = byId(
      (await loadSection(t.ctx, 'month', 'keyFigures')).figures,
    );

    // June 2024 to May 2025.
    expect(income.sparkline.map((point) => point.label)).toEqual([
      'Jun 2024',
      'Jul 2024',
      'Aug 2024',
      'Sep 2024',
      'Oct 2024',
      'Nov 2024',
      'Dec 2024',
      'Jan 2025',
      'Feb 2025',
      'Mar 2025',
      'Apr 2025',
      'May 2025',
    ]);
    expect(values(income)).toEqual([0, 0, 0, 0, 0, 0, 80_000, 0, 50_000, 0, 100_000, 120_000]);
    expect(values(expense)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 40_000, 0, 20_000, 25_000]);
    expect(values(profit)).toEqual([0, 0, 0, 0, 0, 0, 80_000, 0, 10_000, 0, 80_000, 95_000]);
    for (const figure of [income, expense, profit]) {
      expect(partials(figure), figure.label).toEqual([...Array<boolean>(11).fill(false), true]);
    }
  });

  it('in Quarter and Year, give a point per quarter (8) and per year (6), the current one partial', async () => {
    fixToday('2025-05-20');
    await dataset();

    const quarter = byId((await loadSection(t.ctx, 'quarter', 'keyFigures')).figures);
    const year = byId((await loadSection(t.ctx, 'year', 'keyFigures')).figures);

    // Q3 2023 to Q2 2025: December in Q4 2024, February in Q1 2025, April and May in Q2.
    expect(quarter.income.sparkline.map((point) => point.label)).toEqual([
      'Q3 2023',
      'Q4 2023',
      'Q1 2024',
      'Q2 2024',
      'Q3 2024',
      'Q4 2024',
      'Q1 2025',
      'Q2 2025',
    ]);
    expect(values(quarter.income)).toEqual([0, 0, 0, 0, 0, 80_000, 50_000, 220_000]);
    expect(values(quarter.expense)).toEqual([0, 0, 0, 0, 0, 0, 40_000, 45_000]);
    expect(values(quarter.profit)).toEqual([0, 0, 0, 0, 0, 80_000, 10_000, 175_000]);
    expect(partials(quarter.profit)).toEqual([...Array<boolean>(7).fill(false), true]);
    // 2020 to 2025.
    expect(year.income.sparkline.map((point) => point.label)).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
    expect(values(year.income)).toEqual([0, 0, 0, 0, 80_000, 270_000]);
    expect(values(year.expense)).toEqual([0, 0, 0, 0, 0, 85_000]);
    expect(values(year.profit)).toEqual([0, 0, 0, 0, 80_000, 185_000]);
    expect(partials(year.income)).toEqual([false, false, false, false, false, true]);
  });

  it("gives Net worth the Net worth trend's points: each period end of the window, then today", async () => {
    fixToday('2025-05-20');
    await dataset();

    for (const view of ['month', 'quarter', 'year'] as const) {
      const { netWorth } = byId((await loadSection(t.ctx, view, 'keyFigures')).figures);
      const { trend } = await loadSection(t.ctx, view, 'netWorth');

      expect(values(netWorth), view).toEqual(trend.rowTotals.map((total) => total ?? 0));
      expect(partials(netWorth), view).toEqual(trend.rows.map((row) => row.isPartial));
      expect(netWorth.sparkline.at(-1)!.isPartial, view).toBe(true);
    }
    // By hand, in Month: nothing until the December salary; then each month end; then today,
    // the property purchase counting in Net worth (it is no expense).
    const { netWorth } = byId((await loadSection(t.ctx, 'month', 'keyFigures')).figures);
    expect(values(netWorth)).toEqual([
      0, 0, 0, 0, 0, 0, 80_000, 80_000, 90_000, 90_000, 110_000, 205_000,
    ]);
  });

  it('draws a Profit falling below zero: the points keep their sign', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-10', amountMinor: -20_000, classify: groceries },
      { bookingDate: '2025-04-25', amountMinor: 100_000, classify: salary },
      { bookingDate: '2025-05-05', amountMinor: -30_000, classify: groceries },
    ]);

    const { profit } = byId((await loadSection(t.ctx, 'month', 'keyFigures')).figures);

    expect(values(profit).slice(-3)).toEqual([-20_000, 100_000, -30_000]);
  });
});

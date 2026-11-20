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
import type { ChartSource } from '@/lib/reporting/chart-data';

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

const money = String;

describe('Income vs. expense', () => {
  it('is a heatmap card: a row per type, then Net and Net incl. Capital, per period and in Total', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, 'month', 'incomeVsExpense');
    const data = card.data!;

    expect(card.name).toBe('Income vs. expense');
    expect(card.isEmpty).toBe(false);
    expect(readCard(card, money).kind).toBe('grid');
    expect(labels(data.columns)).toEqual([
      ...['Apr 2024', 'May 2024', 'Jun 2024', 'Jul 2024', 'Aug 2024', 'Sep 2024'],
      ...['Oct 2024', 'Nov 2024', 'Dec 2024', 'Jan 2025', 'Feb 2025', 'Mar 2025'],
    ]);
    // The current month is still running: drawn as the Dashboard draws a partial period.
    expect(data.columns.map((column) => column.isPartial)).toEqual([
      ...Array<boolean>(11).fill(false),
      true,
    ]);
    const empty = Array<null>(9).fill(null);
    // Groceries in January: -120.00 + 20.00 refund + EUR -100.00 at 0.94 = -194.00. The split
    // purchase counts -200.00 under Groceries and -100.00 under Property. The Transfer counts
    // nowhere.
    expect(data.rows.map((row, r) => [row.label, data.cells[r], data.rowTotals[r]])).toEqual([
      ['Income', [...empty, 600_000, 600_000, 300_000], 1_500_000],
      ['Expense', [...empty, -19_400, -20_000, -5_000], -44_400],
      ['Capital', [...empty, null, -510_000, null], -510_000],
      ['Net (income − expense)', [...empty, 580_600, 580_000, 295_000], 1_455_600],
      ['Net incl. Capital', [...empty, 580_600, 70_000, 295_000], 945_600],
    ]);
    expect(data.total).toBe(945_600);
  });

  it('leads with its largest row, as a Dashboard heatmap does', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, 'month', 'incomeVsExpense');

    // Income and Expense net to a total Income isn't a share of: the card names the largest row.
    expect(readCard(card, money).lead).toMatchObject({
      headline: 'Income leads',
      detail: '1500000',
    });
  });

  it('reads the window of the Period view: Quarter and Year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = (await loadSection(t.ctx, 'quarter', 'incomeVsExpense')).data!;
    const years = (await loadSection(t.ctx, 'year', 'incomeVsExpense')).data!;

    const expense = (data: ChartSource) => data.rows.findIndex((row) => row.key === 'expense');
    expect(labels(quarters.columns)).toEqual([
      ...['Q2 2023', 'Q3 2023', 'Q4 2023', 'Q1 2024'],
      ...['Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025'],
    ]);
    // February 2024 is in the Quarter and Year windows; the current period is to date.
    expect(quarters.cells[expense(quarters)]).toEqual([
      null,
      null,
      null,
      -999,
      null,
      null,
      null,
      -44_400,
    ]);
    expect(quarters.rowTotals[expense(quarters)]).toBe(-45_399);
    expect(labels(years.columns)).toEqual(['2020', '2021', '2022', '2023', '2024', '2025']);
    expect(years.cells[expense(years)]).toEqual([null, null, null, null, -999, -44_400]);
  });

  it('opens a Drill-down behind every value whose Transactions work out to it, back to Analytics', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, 'quarter', 'incomeVsExpense');

    const values = linkedValues(card.data!);
    // 5 rows of 8 quarters, 5 row totals, 8 column totals and the total.
    expect(values).toHaveLength(5 * 8 + 5 + 8 + 1);
    for (const { value, href } of values) {
      expect(originOf(href)).toEqual({ kind: 'analytics', period: 'quarter' });
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
  });

  it('is empty when no Transaction falls in the window', async () => {
    fixToday('2025-03-20');

    const card = await loadSection(t.ctx, 'year', 'incomeVsExpense');

    expect(card.isEmpty).toBe(true);
    expect(card.data!.rowTotals.every((total) => total === null)).toBe(true);
  });
});

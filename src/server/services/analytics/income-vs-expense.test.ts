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
import { linkTransfer, splitLineSide, transactionSide } from '../transfers';
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
 * February 2024, before Rolling 12 months; and a Transfer out to the EUR Account.
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
  await seedEarlyStart(t.ctx, ubs);
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
  it('is a heatmap card: a row per type, then Profit and Net cash flow, per interval and in Total', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'incomeVsExpense');
    const data = card.data!;

    expect(card.name).toBe('Income vs. expense');
    expect(card.isEmpty).toBe(false);
    expect(readCard(card, money).kind).toBe('grid');
    expect(labels(data.columns)).toEqual([
      ...['Mar 2024', 'Apr 2024', 'May 2024', 'Jun 2024', 'Jul 2024', 'Aug 2024', 'Sep 2024'],
      ...['Oct 2024', 'Nov 2024', 'Dec 2024', 'Jan 2025', 'Feb 2025', 'Mar 2025'],
    ]);
    // March 2024 is cut short at the Period's start and the current month is still running: both
    // drawn as the Dashboard draws a partial interval.
    expect(data.columns.map((column) => column.isPartial)).toEqual([
      true,
      ...Array<boolean>(11).fill(false),
      true,
    ]);
    const empty = Array<null>(10).fill(null);
    // Groceries in January: -120.00 + 20.00 refund + EUR -100.00 at 0.94 = -194.00. The split
    // purchase counts -200.00 under Groceries and -100.00 under Property. The Transfer counts
    // nowhere.
    expect(data.rows.map((row, r) => [row.label, data.cells[r], data.rowTotals[r]])).toEqual([
      ['Income', [...empty, 600_000, 600_000, 300_000], 1_500_000],
      ['Expense', [...empty, -19_400, -20_000, -5_000], -44_400],
      ['Capital', [...empty, null, -510_000, null], -510_000],
      ['Profit', [...empty, 580_600, 580_000, 295_000], 1_455_600],
      ['Net cash flow', [...empty, 580_600, 70_000, 295_000], 945_600],
    ]);
    // Nothing is Unclassified in the Period: no Unclassified row.
    expect(data.rows.map((row) => row.key)).not.toContain('unclassified');
    expect(data.total).toBe(945_600);
  });

  it('adds an Unclassified row after Profit, and Net cash flow takes it in', async () => {
    fixToday('2025-03-20');
    await dataset();
    const home = await createCategoryGroup(t.ctx, { name: 'Home', type: 'expense' });
    const household = await createCategory(t.ctx, { groupId: home.id, name: 'Household' });
    const postFinance = await seedAccount(t.ctx, 'PostFinance');
    const savings = await seedAccount(t.ctx, 'Savings');
    // Unclassified: a purchase in January and a refund in March; a deposit in March.
    const [, , , split] = await seedClassified(t.ctx, postFinance, [
      { bookingDate: '2025-01-12', amountMinor: -7_000 },
      { bookingDate: '2025-03-02', amountMinor: 1_500 },
      { bookingDate: '2025-03-04', amountMinor: 20_000 },
      { bookingDate: '2025-02-08', amountMinor: -50_000 },
    ]);
    // A split purchase whose first line is a Transfer to Savings: only its second line counts.
    const lines = await splitTransaction(t.ctx, split!, [
      { amountMinor: -40_000, categoryId: household.id },
      { amountMinor: -10_000, categoryId: household.id },
    ]);
    const [credit] = await seedClassified(t.ctx, savings, [
      { bookingDate: '2025-02-08', amountMinor: 40_000 },
    ]);
    await linkTransfer(t.ctx, {
      sides: [splitLineSide(lines.splitLines[0]!.id), transactionSide(credit!)],
    });

    const card = await loadSection(t.ctx, MONTHLY, 'incomeVsExpense');
    const data = card.data!;

    const empty = Array<null>(10).fill(null);
    expect(data.rows.map((row, r) => [row.label, data.cells[r], data.rowTotals[r]])).toEqual([
      ['Income', [...empty, 600_000, 600_000, 300_000], 1_500_000],
      ['Expense', [...empty, -19_400, -30_000, -5_000], -54_400],
      ['Capital', [...empty, null, -510_000, null], -510_000],
      ['Profit', [...empty, 580_600, 570_000, 295_000], 1_445_600],
      ['Unclassified', [...empty, -7_000, null, 21_500], 14_500],
      ['Net cash flow', [...empty, 573_600, 60_000, 316_500], 950_100],
    ]);
    expect(data.total).toBe(950_100);
    // Net cash flow per interval is the Net cash flow section's.
    const flow = (await loadSection(t.ctx, MONTHLY, 'netCashFlow')).data!;
    expect(data.cells.at(-1)).toEqual(flow.rowTotals);
    // Its Unclassified and Net cash flow values open the Transactions behind them.
    for (const { value, href } of linkedValues(data)) {
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
  });

  it('shows the Unclassified row when its Transactions net to zero', async () => {
    fixToday('2025-03-20');
    await dataset();
    const postFinance = await seedAccount(t.ctx, 'PostFinance');
    // An Unclassified purchase in January and its refund the same month.
    await seedClassified(t.ctx, postFinance, [
      { bookingDate: '2025-01-12', amountMinor: -7_000 },
      { bookingDate: '2025-01-14', amountMinor: 7_000 },
    ]);

    const data = (await loadSection(t.ctx, MONTHLY, 'incomeVsExpense')).data!;

    const empty = Array<null>(10).fill(null);
    const unclassified = data.rows.findIndex((row) => row.key === 'unclassified');
    expect(data.rows.map((row) => row.key)).toEqual([
      'income',
      'expense',
      'capital',
      'profit',
      'unclassified',
      'netCashFlow',
    ]);
    expect(data.cells[unclassified]).toEqual([...empty, 0, null, null]);
    expect(data.rowTotals[unclassified]).toBe(0);
  });

  it('shows the Unclassified row when its only Transactions could not be converted', async () => {
    fixToday('2025-03-20');
    await dataset();
    // No GBP rate at all: the Unclassified payment is left out.
    const barclays = await seedAccount(t.ctx, 'Barclays', 'GBP');
    await seedClassified(t.ctx, barclays, [{ bookingDate: '2025-02-12', amountMinor: -3_000 }]);

    const data = (await loadSection(t.ctx, MONTHLY, 'incomeVsExpense')).data!;

    expect(data.rows.map((row) => row.key)).toContain('unclassified');
  });

  it('leads with its largest row, as a Dashboard heatmap does', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'incomeVsExpense');

    // Income and Expense net to a total Income isn't a share of: the card names the largest row.
    expect(readCard(card, money).lead).toMatchObject({
      headline: 'Income leads',
      detail: '1500000',
    });
  });

  it('reads the Period by quarter and by year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = (await loadSection(t.ctx, QUARTERLY, 'incomeVsExpense')).data!;
    const years = (await loadSection(t.ctx, YEARLY, 'incomeVsExpense')).data!;

    const expense = (data: ChartSource) => data.rows.findIndex((row) => row.key === 'expense');
    expect(labels(quarters.columns)).toEqual([
      ...['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025'],
    ]);
    // February 2024 is in both Periods (not in Rolling 12 months); the current interval is to date.
    expect(quarters.cells[expense(quarters)]).toEqual([-999, null, null, null, -44_400]);
    expect(quarters.rowTotals[expense(quarters)]).toBe(-45_399);
    expect(labels(years.columns)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    expect(years.cells[expense(years)]).toEqual([null, null, null, -999, -44_400]);
  });

  it('opens a Drill-down behind every value whose Transactions work out to it, back to Analytics', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, QUARTERLY, 'incomeVsExpense');

    const values = linkedValues(card.data!);
    // 5 rows of 5 quarters, 5 row totals, 5 column totals and the total.
    expect(values).toHaveLength(5 * 5 + 5 + 5 + 1);
    for (const { value, href } of values) {
      expect(originOf(href)).toEqual({
        kind: 'analytics',
        page: { period: QUARTERLY, cardPeriods: {} },
      });
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
  });

  it('pinned, reads its own Period by quarter while the page reads months, each Drill-down over it', async () => {
    fixToday('2025-03-20');
    await dataset();
    const pins = { 'income-vs-expense': 'this-year-and-last-1' } as const;

    const card = await loadSection(t.ctx, MONTHLY, 'incomeVsExpense', pins);
    const data = card.data!;

    expect(card.isPinned).toBe(true);
    expect(card.reading).toMatchObject({
      period: presetPeriod('this-year-and-last-1'),
      from: '2024-01-01',
      grain: 'quarter',
    });
    expect(data.columns.map((column) => [column.label, column.isPartial])).toEqual([
      ['Q1 2024', false],
      ['Q2 2024', false],
      ['Q3 2024', false],
      ['Q4 2024', false],
      ['Q1 2025', true],
    ]);
    const expense = data.rows.findIndex((row) => row.key === 'expense');
    // February 2024's groceries are outside the page's Rolling 12 months, inside the pin.
    expect(data.cells[expense]).toEqual([-999, null, null, null, -44_400]);
    for (const { value, href } of linkedValues(data)) {
      expect(originOf(href)).toEqual({
        kind: 'analytics',
        page: { period: MONTHLY, cardPeriods: pins },
      });
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
  });

  it('pinned, sets apart its own partial first and to-date last Intervals', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, YEARLY, 'incomeVsExpense', {
      'income-vs-expense': 'rolling-90-days',
    });
    const data = card.data!;

    expect(data.columns.map((column) => [column.label, column.isPartial])).toEqual([
      ['Dec 2024', true],
      ['Jan 2025', false],
      ['Feb 2025', false],
      ['Mar 2025', true],
    ]);
    const expense = data.rows.findIndex((row) => row.key === 'expense');
    expect(data.cells[expense]).toEqual([null, -19_400, -20_000, -5_000]);
  });

  it('unpinned, follows the page Period and says so', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, YEARLY, 'incomeVsExpense', {
      'net-cash-flow': 'rolling-90-days',
    });

    expect(card.isPinned).toBe(false);
    expect(card.reading).toMatchObject({ period: YEARLY, grain: 'year' });
    expect(labels(card.data!.columns)).toEqual(['2021', '2022', '2023', '2024', '2025']);
  });

  it('is empty when no Transaction falls in the Period', async () => {
    fixToday('2025-03-20');

    const card = await loadSection(t.ctx, YEARLY, 'incomeVsExpense');

    expect(card.isEmpty).toBe(true);
    expect(card.data!.rowTotals.every((total) => total === null)).toBe(true);
  });
});

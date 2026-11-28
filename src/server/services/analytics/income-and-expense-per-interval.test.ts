import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixToday,
  labels,
  loadSection,
  openDrill,
  originOf,
  seedAccount,
  seedClassified,
  seedEarlyStart,
} from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/periods';
import { setupTestDatabase } from '@test/support/db';
import { presetPeriod } from '@/lib/analytics/period';
import type { IntervalPair } from '@/lib/reporting/bars-flow';
import { readCard, type CardMark } from '@/lib/reporting/card';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { linkTransfer, transactionSide } from '../transfers';

/**
 * Analytics' Income and expense per interval Card (spec #286, ADR-0022): the Income and Expense
 * Category groups per Interval of the Period, drawn as a bars flow's grouped bars.
 */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. A salary in January and March (to date), groceries in January and
 * February, a refund in February; a property purchase (Capital), an uncategorised payment and a
 * Transfer between the two Accounts classified as Salary, all left out.
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
  const savings = await seedAccount(t.ctx, 'Savings');
  const [, , , , , , , transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-03-10', amountMinor: 300_000, classify: as(salary) },
    { bookingDate: '2025-01-05', amountMinor: -80_000, classify: as(groceries) },
    { bookingDate: '2025-02-05', amountMinor: -40_000, classify: as(groceries) },
    { bookingDate: '2025-02-08', amountMinor: 5_000, classify: as(groceries) },
    { bookingDate: '2025-02-15', amountMinor: -500_000, classify: as(property) },
    { bookingDate: '2025-03-12', amountMinor: -7_000 },
    { bookingDate: '2025-02-20', amountMinor: -250_000, classify: as(salary) },
  ]);
  const [transferIn] = await seedClassified(t.ctx, savings, [
    { bookingDate: '2025-02-20', amountMinor: 250_000, classify: as(salary) },
  ]);
  await linkTransfer(t.ctx, {
    sides: [transactionSide(transferOut!), transactionSide(transferIn!)],
  });
}

const money = String;

function pairsOf(mark: CardMark): IntervalPair[] {
  if (mark.type !== 'groupedBars') throw new Error(`Expected grouped bars, got ${mark.type}`);
  return mark.intervals;
}

/** Each pair's Interval, partial flag, income and expense. */
const figures = (pairs: readonly IntervalPair[]) =>
  pairs.map((pair) => [pair.key, pair.isPartial, pair.income, pair.expense]);

describe('Income and expense per interval', () => {
  it('draws a bar pair for every month of the Period, the cut-short first and to-date last partial', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'incomeAndExpensePerInterval');
    const pairs = pairsOf(readCard(card, money).mark);

    expect(card.name).toBe('Income and expense per interval');
    expect(card.isEmpty).toBe(false);
    expect(card.unconvertedCount).toBe(0);
    expect(pairs.map((pair) => pair.key)).toEqual([
      ...['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'],
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    expect(pairs.map((pair) => pair.isPartial)).toEqual([
      true,
      ...Array<boolean>(11).fill(false),
      true,
    ]);
    // Only the to-date month is still running: the first is partial for being cut short.
    expect(pairs.map((pair) => pair.isRunning)).toEqual([...Array<boolean>(12).fill(false), true]);
    // February: groceries 400.00 less a 50.00 refund. Capital, the uncategorised payment and
    // the Transfer count nowhere.
    expect(figures(pairs.slice(-3))).toEqual([
      ['2025-01', false, 600_000, 80_000],
      ['2025-02', false, 0, 35_000],
      ['2025-03', true, 300_000, 0],
    ]);
  });

  it('says in how many complete months income beat expense, then the running one so far', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'incomeAndExpensePerInterval');

    expect(readCard(card, money).lead?.headline).toBe(
      'Income beat expense in 1 of 11 complete months; this month so far: in 300000, out 0.',
    );
  });

  it('follows Periods read by quarter and by year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = pairsOf(
      readCard(await loadSection(t.ctx, QUARTERLY, 'incomeAndExpensePerInterval'), money).mark,
    );
    const years = pairsOf(
      readCard(await loadSection(t.ctx, YEARLY, 'incomeAndExpensePerInterval'), money).mark,
    );

    expect(labels(quarters)).toEqual(['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025']);
    expect(figures(quarters).at(-1)).toEqual(['2025-Q1', true, 900_000, 115_000]);
    expect(labels(years)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    expect(figures(years).at(-1)).toEqual(['2025', true, 900_000, 115_000]);
  });

  it('opens a Drill-down behind every bar whose Transactions add up to it, back to Analytics', async () => {
    fixToday('2025-03-20');
    await dataset();

    for (const view of [MONTHLY, QUARTERLY, YEARLY]) {
      const card = await loadSection(t.ctx, view, 'incomeAndExpensePerInterval');
      for (const pair of pairsOf(readCard(card, money).mark)) {
        for (const href of [pair.incomeHref, pair.expenseHref]) {
          expect(originOf(href)).toEqual({
            kind: 'analytics',
            page: { period: view, cardPeriods: {} },
          });
        }
        expect((await openDrill(t.ctx, pair.incomeHref)).value ?? 0).toBe(pair.income);
        expect(0 - ((await openDrill(t.ctx, pair.expenseHref)).value ?? 0)).toBe(pair.expense);
      }
    }
  });

  it('pinned, is read wholly over its Card Period while the page reads years', async () => {
    fixToday('2025-03-20');
    await dataset();
    const pins = { 'income-and-expense-per-interval': 'year-to-date' } as const;

    const card = await loadSection(t.ctx, YEARLY, 'incomeAndExpensePerInterval', pins);
    const other = await loadSection(t.ctx, YEARLY, 'netCashFlow', pins);
    const pairs = pairsOf(readCard(card, money).mark);

    expect(card.isPinned).toBe(true);
    expect(card.periodName).toBe('Year to date');
    expect(card.reading).toMatchObject({
      period: presetPeriod('year-to-date'),
      from: '2025-01-01',
      grain: 'month',
    });
    expect(figures(pairs)).toEqual([
      ['2025-01', false, 600_000, 80_000],
      ['2025-02', false, 0, 35_000],
      ['2025-03', true, 300_000, 0],
    ]);
    expect(readCard(card, money).lead?.headline).toBe(
      'Income beat expense in 1 of 2 complete months; this month so far: in 300000, out 0.',
    );
    for (const pair of pairs) {
      expect(originOf(pair.incomeHref)).toEqual({
        kind: 'analytics',
        page: { period: YEARLY, cardPeriods: pins },
      });
      expect((await openDrill(t.ctx, pair.incomeHref)).value ?? 0).toBe(pair.income);
      expect(0 - ((await openDrill(t.ctx, pair.expenseHref)).value ?? 0)).toBe(pair.expense);
    }
    // The other sections follow the page.
    expect(other.isPinned).toBe(false);
    expect(other.reading).toMatchObject({ period: YEARLY, grain: 'year' });
  });

  it('unpinned, follows the page Period', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, YEARLY, 'incomeAndExpensePerInterval', {
      'net-cash-flow': 'rolling-30-days',
    });

    expect(card.isPinned).toBe(false);
    expect(card.periodName).toBeNull();
    expect(card.reading).toMatchObject({ period: YEARLY, grain: 'year' });
  });

  it('counts the Transactions left out for want of an FX rate', async () => {
    fixToday('2025-03-20');
    await dataset();
    const abroad = await createCategoryGroup(t.ctx, { name: 'Abroad', type: 'expense' });
    const travel = await createCategory(t.ctx, { groupId: abroad.id, name: 'Travel' });
    // No FX rate is held for ISK.
    const iceland = await seedAccount(t.ctx, 'Iceland', 'ISK');
    await seedClassified(t.ctx, iceland, [
      { bookingDate: '2025-02-10', amountMinor: -10_000, classify: { categoryId: travel.id } },
    ]);

    const card = await loadSection(t.ctx, MONTHLY, 'incomeAndExpensePerInterval');

    expect(card.unconvertedCount).toBe(1);
  });

  it('draws an Income and an Expense bar for every Interval when the Period has expense but no income', async () => {
    fixToday('2025-03-20');
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedEarlyStart(t.ctx, ubs);
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-01-05', amountMinor: -80_000, classify: { categoryId: groceries.id } },
      { bookingDate: '2025-02-05', amountMinor: -40_000, classify: { categoryId: groceries.id } },
    ]);

    const card = await loadSection(t.ctx, MONTHLY, 'incomeAndExpensePerInterval');
    const pairs = pairsOf(readCard(card, money).mark);

    expect(pairs).toHaveLength(13);
    expect(figures(pairs.slice(-3))).toEqual([
      ['2025-01', false, 0, 80_000],
      ['2025-02', false, 0, 40_000],
      ['2025-03', true, 0, 0],
    ]);
    // The empty Income bars open the Income Drill-down of their month: nothing.
    for (const pair of pairs.slice(-3)) {
      expect((await openDrill(t.ctx, pair.incomeHref)).value ?? 0).toBe(0);
      expect(0 - ((await openDrill(t.ctx, pair.expenseHref)).value ?? 0)).toBe(pair.expense);
    }
  });

  it('keeps Income and Expense apart when a refund turns a month of expense positive', async () => {
    fixToday('2025-03-20');
    const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
    const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
    const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedEarlyStart(t.ctx, ubs);
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-01-25', amountMinor: 10_000, classify: { categoryId: salary.id } },
      { bookingDate: '2025-02-08', amountMinor: 30_000, classify: { categoryId: groceries.id } },
    ]);

    const card = await loadSection(t.ctx, MONTHLY, 'incomeAndExpensePerInterval');
    const pairs = pairsOf(readCard(card, money).mark);

    // The refund reads as expense netting the wrong way, never as income.
    expect(figures(pairs.slice(-3))).toEqual([
      ['2025-01', false, 10_000, 0],
      ['2025-02', false, 0, -30_000],
      ['2025-03', true, 0, 0],
    ]);
  });

  it('is empty when the Period has no income or expense, Capital and Unclassified aside', async () => {
    fixToday('2025-03-20');
    const group = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
    const property = await createCategory(t.ctx, { groupId: group.id, name: 'Property' });
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedEarlyStart(t.ctx, ubs);
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-05', amountMinor: -500_000, classify: { categoryId: property.id } },
      { bookingDate: '2025-03-06', amountMinor: -7_000 },
    ]);

    const card = await loadSection(t.ctx, MONTHLY, 'incomeAndExpensePerInterval');

    expect(card.isEmpty).toBe(true);
  });
});

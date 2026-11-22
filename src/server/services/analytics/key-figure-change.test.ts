import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixToday,
  loadSection,
  openDrill,
  originOf,
  seedAccount,
  seedClassified,
} from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/spans';
import { setupTestDatabase } from '@test/support/db';
import type { Span } from '@/lib/analytics/span';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import type { KeyFigure, KeyFigureId } from './key-figures';

/** Key figures' change line against the Comparison span (spec #225 stories 12-23, 31-32; #229). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

async function categories() {
  const pay = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const living = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const as = (category: Category) => ({ categoryId: category.id });
  return {
    salary: as(await createCategory(t.ctx, { groupId: pay.id, name: 'Salary' })),
    groceries: as(await createCategory(t.ctx, { groupId: living.id, name: 'Groceries' })),
  };
}

/** An Unclassified booking in March: the Account's data reaches back before April. */
const SINCE_MARCH = { bookingDate: '2025-03-01', amountMinor: 1_000 };

async function figuresAt(view: Span): Promise<Record<KeyFigureId, KeyFigure>> {
  const section = await loadSection(t.ctx, view, 'keyFigures');
  return Object.fromEntries(section.figures.map((figure) => [figure.id, figure])) as Record<
    KeyFigureId,
    KeyFigure
  >;
}

describe('Key figures change', () => {
  it('on a mid-month day, compares this month to date with the same days of last month', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-10', amountMinor: 10_000, classify: salary },
      { bookingDate: '2025-04-15', amountMinor: 100_000, classify: salary },
      // After the 20th of April: outside the Comparison span.
      { bookingDate: '2025-04-25', amountMinor: 70_000, classify: salary },
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
    ]);

    const { income } = await figuresAt(MONTHLY);

    expect(income.change).toMatchObject({
      amount: 20_000,
      label: 'vs 1–20 Apr',
    });
  });

  it('on the 31st, compares with the whole of a 28-day February', async () => {
    fixToday('2025-03-31');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-01-31', amountMinor: 5_000, classify: salary },
      { bookingDate: '2025-02-28', amountMinor: 30_000, classify: salary },
      { bookingDate: '2025-03-31', amountMinor: 40_000, classify: salary },
    ]);

    const { income } = await figuresAt(MONTHLY);

    expect(income.change).toMatchObject({
      amount: 10_000,
      label: 'vs 1–28 Feb',
    });
  });

  it('by quarter, compares with the same number of days into the previous quarter', async () => {
    // The 50th day of Q2 (1 April is the first); the 50th of Q1 is 19 February.
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-12-31', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-02-19', amountMinor: 30_000, classify: salary },
      { bookingDate: '2025-02-20', amountMinor: 80_000, classify: salary },
      { bookingDate: '2025-04-01', amountMinor: 50_000, classify: salary },
    ]);

    const { income } = await figuresAt(QUARTERLY);

    expect(income.change).toMatchObject({
      amount: 20_000,
      label: 'vs 1 Jan – 19 Feb',
    });
  });

  it('by quarter, on the last day of a longer quarter, compares with the whole previous one', async () => {
    // Q3 has 92 days, Q2 91: 30 September is compared with all of Q2.
    fixToday('2025-09-30');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-31', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-06-30', amountMinor: 30_000, classify: salary },
    ]);

    const { income } = await figuresAt(QUARTERLY);

    expect(income.change?.label).toBe('vs 1 Apr – 30 Jun');
  });

  it('by year, compares with the same dates last year', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-01-01', amountMinor: 30_000, classify: salary },
      { bookingDate: '2024-05-21', amountMinor: 90_000, classify: salary },
      { bookingDate: '2025-03-01', amountMinor: 50_000, classify: salary },
    ]);

    const { income } = await figuresAt(YEARLY);

    expect(income.change).toMatchObject({
      amount: 20_000,
      label: 'vs 1 Jan – 20 May 2024',
    });
  });

  it('on 29 February, by year, compares up to 28 February last year', async () => {
    fixToday('2024-02-29');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2023-01-01', amountMinor: 1_000, classify: salary },
      { bookingDate: '2024-02-29', amountMinor: 1_000, classify: salary },
    ]);

    const { income } = await figuresAt(YEARLY);

    expect(income.change).toMatchObject({
      label: 'vs 1 Jan – 28 Feb 2023',
    });
  });

  it('gives the % when the earlier value is above zero, and counts Expense going up as bad', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      SINCE_MARCH,
      { bookingDate: '2025-04-15', amountMinor: 100_000, classify: salary },
      { bookingDate: '2025-04-16', amountMinor: -20_000, classify: groceries },
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
      { bookingDate: '2025-05-11', amountMinor: -25_000, classify: groceries },
    ]);

    const { income, expense, profit } = await figuresAt(MONTHLY);

    expect([income.change, expense.change, profit.change]).toMatchObject([
      { amount: 20_000, percent: 0.2, direction: 'up', isGood: true },
      { amount: 5_000, percent: 0.25, direction: 'up', isGood: false },
      { amount: 15_000, percent: 0.1875, direction: 'up', isGood: true },
    ]);
  });

  it('gives no % when the earlier value is zero or negative, and counts Expense going down as good', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-01', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-04-16', amountMinor: -40_000, classify: groceries },
      { bookingDate: '2025-05-10', amountMinor: 50_000, classify: salary },
      { bookingDate: '2025-05-11', amountMinor: -10_000, classify: groceries },
    ]);

    const { income, expense, profit } = await figuresAt(MONTHLY);

    // April 1-20: no income, CHF 400 out, a Profit of −CHF 400.
    expect([income.change, expense.change, profit.change]).toMatchObject([
      { amount: 50_000, percent: null, direction: 'up', isGood: true },
      { amount: -30_000, percent: -0.75, direction: 'down', isGood: true },
      { amount: 80_000, percent: null, direction: 'up', isGood: true },
    ]);
  });

  it('reads no direction, good or bad, when the figure has not moved', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      SINCE_MARCH,
      { bookingDate: '2025-04-15', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-05-15', amountMinor: 1_000, classify: salary },
    ]);

    const { income, expense } = await figuresAt(MONTHLY);

    expect(income.change).toMatchObject({ amount: 0, direction: 'flat', isGood: null });
    expect(expense.change).toMatchObject({ amount: 0, percent: null, direction: 'flat' });
  });

  it('compares Net worth with the end of the previous period, opening the Accounts then', async () => {
    fixToday('2025-05-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-10', amountMinor: 10_000 },
      { bookingDate: '2025-04-15', amountMinor: 100_000 },
      { bookingDate: '2025-05-10', amountMinor: -55_000 },
    ]);

    const month = (await figuresAt(MONTHLY)).netWorth;
    const quarter = (await figuresAt(QUARTERLY)).netWorth;

    expect(month.change).toEqual({
      amount: -55_000,
      percent: -0.5,
      direction: 'down',
      isGood: false,
      label: 'vs 30 Apr',
      href: '/accounts?date=2025-04-30',
    });
    expect(quarter.change).toMatchObject({
      amount: 45_000,
      percent: 4.5,
      isGood: true,
      label: 'vs 31 Mar',
      href: '/accounts?date=2025-03-31',
    });
  });

  it('opens the Transactions of both stretches of days, and none between them', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      SINCE_MARCH,
      { bookingDate: '2025-04-15', amountMinor: 100_000, classify: salary },
      { bookingDate: '2025-04-16', amountMinor: -20_000, classify: groceries },
      // Between the Comparison span and this month: in neither stretch.
      { bookingDate: '2025-04-25', amountMinor: 70_000, classify: salary },
      { bookingDate: '2025-04-26', amountMinor: -9_000, classify: groceries },
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
      { bookingDate: '2025-05-11', amountMinor: -25_000, classify: groceries },
    ]);

    const { income, expense, profit } = await figuresAt(MONTHLY);

    const incomeBoth = await openDrill(t.ctx, income.change?.href);
    expect(incomeBoth.sumChfMinor).toBe(220_000);
    expect(incomeBoth.subtotals).toEqual([
      { key: '2025-05', sumChfMinor: 120_000 },
      { key: '2025-04', sumChfMinor: 100_000 },
    ]);
    const expenseBoth = await openDrill(t.ctx, expense.change?.href);
    expect(expenseBoth.subtotals).toEqual([
      { key: '2025-05', sumChfMinor: -25_000 },
      { key: '2025-04', sumChfMinor: -20_000 },
    ]);
    const profitBoth = await openDrill(t.ctx, profit.change?.href);
    expect(profitBoth.total).toBe(4);
    expect(profitBoth.subtotals).toEqual([
      { key: '2025-05', sumChfMinor: 95_000 },
      { key: '2025-04', sumChfMinor: 80_000 },
    ]);
    expect(originOf(profit.change!.href)).toEqual({ kind: 'analytics', span: MONTHLY });
  });

  it('by year, opens both stretches a year apart', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-01-01', amountMinor: 30_000, classify: salary },
      { bookingDate: '2024-05-21', amountMinor: 90_000, classify: salary },
      { bookingDate: '2025-03-01', amountMinor: 50_000, classify: salary },
    ]);

    const { income } = await figuresAt(YEARLY);

    const both = await openDrill(t.ctx, income.change?.href);
    expect(both.subtotals).toEqual([
      { key: '2025', sumChfMinor: 50_000 },
      { key: '2024', sumChfMinor: 30_000 },
    ]);
  });

  it('has no change when the Account data does not reach back to what it is compared with', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // The data starts on 5 April: after the Comparison span's start, before April's end.
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-04-05', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-05-15', amountMinor: 1_000, classify: salary },
    ]);

    const month = await figuresAt(MONTHLY);
    const quarter = await figuresAt(QUARTERLY);

    expect([month.income, month.expense, month.profit].map((figure) => figure.change)).toEqual([
      null,
      null,
      null,
    ]);
    expect(month.netWorth.change).toMatchObject({ amount: 1_000, label: 'vs 30 Apr' });
    // By quarter, Net worth is compared with 31 March: before the data starts.
    expect(quarter.netWorth.change).toBeNull();
  });

  it('with no Accounts, has no change at all', async () => {
    fixToday('2025-05-20');

    const section = await loadSection(t.ctx, MONTHLY, 'keyFigures');

    expect(section.figures.map((figure) => figure.change)).toEqual([null, null, null, null]);
  });
});

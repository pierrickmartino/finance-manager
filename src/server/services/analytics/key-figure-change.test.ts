import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixToday,
  loadSection,
  openDrill,
  originOf,
  seedAccount,
  seedClassified,
  seedEarlyStart,
} from '@test/support/analytics';
import { MONTHLY, QUARTERLY } from '@test/support/periods';
import { setupTestDatabase } from '@test/support/db';
import { presetPeriod, type Period } from '@/lib/analytics/period';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import type { CellTransactionPage } from '../reporting';
import type { KeyFigure, KeyFigureId } from './key-figures';

/**
 * Key figures' change line against the Period's Comparison period (spec #225 stories 12-23, 31-32;
 * #229; spec #204 stories 27-29, ticket #235).
 */

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

const QUARTER_TO_DATE = presetPeriod('quarter-to-date');
const YEAR_TO_DATE = presetPeriod('year-to-date');

/** From 1 May 2025: on 20 May, compared with the 20 days before it, 11–30 April. */
const SINCE_MAY: Period = { kind: 'custom', from: '2025-05-01' };

/** An Unclassified booking in March: the Account's data reaches back before April. */
const SINCE_MARCH = { bookingDate: '2025-03-01', amountMinor: 1_000 };

async function figuresAt(period: Period): Promise<Record<KeyFigureId, KeyFigure>> {
  const section = await loadSection(t.ctx, period, 'keyFigures');
  return Object.fromEntries(section.figures.map((figure) => [figure.id, figure])) as Record<
    KeyFigureId,
    KeyFigure
  >;
}

/** A Drill-down's interval subtotals that hold Transactions: it lists empty months between too. */
const booked = (page: CellTransactionPage) =>
  (page.subtotals ?? []).filter((subtotal) => subtotal.sumChfMinor !== 0);

describe('Key figures change', () => {
  it('compares Quarter to date with as many days into the previous quarter', async () => {
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

    const { income } = await figuresAt(QUARTER_TO_DATE);

    expect(income.change).toMatchObject({
      amount: 20_000,
      label: 'vs 1 Jan – 19 Feb',
    });
  });

  it('compares Quarter to date on the last day of a longer quarter with the whole previous one', async () => {
    // Q3 has 92 days, Q2 91: 30 September is compared with all of Q2.
    fixToday('2025-09-30');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-03-31', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-06-30', amountMinor: 30_000, classify: salary },
    ]);

    const { income } = await figuresAt(QUARTER_TO_DATE);

    expect(income.change?.label).toBe('vs 1 Apr – 30 Jun');
  });

  it('compares Year to date with the same dates last year', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-01-01', amountMinor: 30_000, classify: salary },
      { bookingDate: '2024-05-21', amountMinor: 90_000, classify: salary },
      { bookingDate: '2025-03-01', amountMinor: 50_000, classify: salary },
    ]);

    const { income } = await figuresAt(YEAR_TO_DATE);

    expect(income.change).toMatchObject({
      amount: 20_000,
      label: 'vs 1 Jan – 20 May 2024',
    });
  });

  it('compares Year to date on 29 February up to 28 February last year', async () => {
    fixToday('2024-02-29');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2023-01-01', amountMinor: 1_000, classify: salary },
      { bookingDate: '2024-02-29', amountMinor: 1_000, classify: salary },
    ]);

    const { income } = await figuresAt(YEAR_TO_DATE);

    expect(income.change).toMatchObject({
      label: 'vs 1 Jan – 28 Feb 2023',
    });
  });

  it('compares this-year-and-last-2 with the same dates of the three years before', async () => {
    fixToday('2026-11-22');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2020-12-31', amountMinor: 1_000, classify: salary },
      { bookingDate: '2021-01-01', amountMinor: 10_000, classify: salary },
      { bookingDate: '2023-11-22', amountMinor: 20_000, classify: salary },
      // After 22 Nov 2023: in neither stretch.
      { bookingDate: '2023-11-23', amountMinor: 70_000, classify: salary },
      { bookingDate: '2024-01-01', amountMinor: 40_000, classify: salary },
      { bookingDate: '2026-11-22', amountMinor: 5_000, classify: salary },
    ]);

    const { income } = await figuresAt(presetPeriod('this-year-and-last-2'));

    expect(income.value).toBe(45_000);
    expect(income.change).toMatchObject({
      amount: 15_000,
      label: 'vs 1 Jan 2021 – 22 Nov 2023',
    });
  });

  it('compares Last 90 days with the 90 days just before it', async () => {
    // 25 Aug – 22 Nov 2026, against 27 May – 24 Aug.
    fixToday('2026-11-22');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2026-05-26', amountMinor: 1_000, classify: salary },
      { bookingDate: '2026-05-27', amountMinor: 10_000, classify: salary },
      { bookingDate: '2026-08-24', amountMinor: 20_000, classify: salary },
      { bookingDate: '2026-08-25', amountMinor: 50_000, classify: salary },
    ]);

    const { income } = await figuresAt(presetPeriod('rolling-90-days'));

    expect(income.change).toMatchObject({
      amount: 20_000,
      label: 'vs 27 May – 24 Aug',
    });
    const both = await openDrill(t.ctx, income.change?.href);
    expect(both.sumChfMinor).toBe(80_000);
  });

  it('compares a custom Period with as many days just before its start', async () => {
    // 1–22 November: 22 days, against 10–31 October.
    fixToday('2026-11-22');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2026-10-09', amountMinor: 1_000, classify: salary },
      { bookingDate: '2026-10-10', amountMinor: 10_000, classify: salary },
      { bookingDate: '2026-10-31', amountMinor: 20_000, classify: salary },
      { bookingDate: '2026-11-01', amountMinor: 40_000, classify: salary },
    ]);

    const { income } = await figuresAt({ kind: 'custom', from: '2026-11-01' });

    expect(income.change).toMatchObject({
      amount: 10_000,
      label: 'vs 10–31 Oct',
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

    const { income, expense, profit } = await figuresAt(SINCE_MAY);

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

    const { income, expense, profit } = await figuresAt(SINCE_MAY);

    // April 11-30: no income, CHF 400 out, a Profit of −CHF 400.
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

    const { income, expense } = await figuresAt(SINCE_MAY);

    expect(income.change).toMatchObject({ amount: 0, direction: 'flat', isGood: null });
    expect(expense.change).toMatchObject({ amount: 0, percent: null, direction: 'flat' });
  });

  it('compares Net worth with the end of the previous interval, opening the Accounts then', async () => {
    fixToday('2025-05-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedEarlyStart(t.ctx, ubs);
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
    // Quarter to date, 1 Apr – 20 May, against 1 Jan – 19 Feb.
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-12-31', amountMinor: 1_000 },
      { bookingDate: '2025-01-15', amountMinor: 100_000, classify: salary },
      { bookingDate: '2025-01-16', amountMinor: -20_000, classify: groceries },
      // Between the Comparison period and the Period: in neither stretch.
      { bookingDate: '2025-03-10', amountMinor: 70_000, classify: salary },
      { bookingDate: '2025-03-11', amountMinor: -9_000, classify: groceries },
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
      { bookingDate: '2025-05-11', amountMinor: -25_000, classify: groceries },
    ]);

    const { income, expense, profit } = await figuresAt(QUARTER_TO_DATE);

    const incomeBoth = await openDrill(t.ctx, income.change?.href);
    expect(incomeBoth.sumChfMinor).toBe(220_000);
    expect(booked(incomeBoth)).toEqual([
      { key: '2025-05', sumChfMinor: 120_000 },
      { key: '2025-01', sumChfMinor: 100_000 },
    ]);
    const expenseBoth = await openDrill(t.ctx, expense.change?.href);
    expect(booked(expenseBoth)).toEqual([
      { key: '2025-05', sumChfMinor: -25_000 },
      { key: '2025-01', sumChfMinor: -20_000 },
    ]);
    const profitBoth = await openDrill(t.ctx, profit.change?.href);
    expect(profitBoth.total).toBe(4);
    expect(booked(profitBoth)).toEqual([
      { key: '2025-05', sumChfMinor: 95_000 },
      { key: '2025-01', sumChfMinor: 80_000 },
    ]);
    expect(originOf(profit.change!.href)).toEqual({
      kind: 'analytics',
      page: { period: QUARTER_TO_DATE, cardPeriods: {} },
    });
  });

  it('over Year to date, opens both stretches a year apart', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-01-01', amountMinor: 30_000, classify: salary },
      { bookingDate: '2024-05-21', amountMinor: 90_000, classify: salary },
      { bookingDate: '2025-03-01', amountMinor: 50_000, classify: salary },
    ]);

    const { income } = await figuresAt(YEAR_TO_DATE);

    const both = await openDrill(t.ctx, income.change?.href);
    expect(booked(both)).toEqual([
      { key: '2025-03', sumChfMinor: 50_000 },
      { key: '2024-01', sumChfMinor: 30_000 },
    ]);
  });

  it('has no change when the Account data does not reach back to what it is compared with', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // The data starts on 5 April: after the Comparison period's start, before April's end.
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-04-05', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-05-15', amountMinor: 1_000, classify: salary },
    ]);

    const month = await figuresAt(MONTHLY);

    expect([month.income, month.expense, month.profit].map((figure) => figure.change)).toEqual([
      null,
      null,
      null,
    ]);
    expect(month.netWorth.change).toMatchObject({ amount: 1_000, label: 'vs 30 Apr' });
  });

  it('has no Net worth change when the data starts in the current interval', async () => {
    fixToday('2025-05-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2025-05-05', amountMinor: 1_000 }]);

    const month = await figuresAt(MONTHLY);

    // The Period is cut to 5 May: Net worth would be compared with 30 April, before the data.
    expect(month.netWorth.change).toBeNull();
  });

  it('with no Accounts, has no change at all', async () => {
    fixToday('2025-05-20');

    const section = await loadSection(t.ctx, MONTHLY, 'keyFigures');

    expect(section.figures.map((figure) => figure.change)).toEqual([null, null, null, null]);
  });
});

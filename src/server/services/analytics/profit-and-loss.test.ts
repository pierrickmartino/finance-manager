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
import { setupTestDatabase } from '@test/support/db';
import { presetPeriod, type Period } from '@/lib/analytics/period';
import { readTransactionSearch } from '@/app/transactions/search';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { listTransactions, splitTransaction } from '../transactions';
import { linkTransfer, splitLineSide, transactionSide } from '../transfers';
import type { ProfitAndLossRow } from './profit-and-loss';

/** Analytics' Profit and loss over the Period (spec #247, ticket #249). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

async function categories() {
  const pay = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const living = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const wealth = await createCategoryGroup(t.ctx, { name: 'Wealth', type: 'capital' });
  const investing = await createCategoryGroup(t.ctx, { name: 'Investing', type: 'capital' });
  const as = (category: Category) => ({ categoryId: category.id });
  const groceries = await createCategory(t.ctx, { groupId: living.id, name: 'Groceries' });
  return {
    salary: as(await createCategory(t.ctx, { groupId: pay.id, name: 'Salary' })),
    groceries: as(groceries),
    groceriesId: groceries.id,
    property: as(await createCategory(t.ctx, { groupId: wealth.id, name: 'Property' })),
    shares: as(await createCategory(t.ctx, { groupId: investing.id, name: 'Shares' })),
  };
}

/**
 * Today is 20 May 2025, read from 15 February. Salaries of 500.00 on 10 February (before the
 * Period), 500.00 in February and 1,000.00 in April; groceries of 200.00 in April, 300.00 in May
 * and a 50.00 refund; a split purchase in March, 200.00 of groceries and 100.00 moved to
 * savings (a Transfer Split line); a property purchase of 2,000.00 and a sale of shares for
 * 800.00 (Capital, two groups); an Unclassified payment of 70.00; and a Transfer of 500.00 out
 * to savings.
 */
async function dataset(): Promise<void> {
  const { salary, groceries, groceriesId, property, shares } = await categories();
  const ubs = await seedAccount(t.ctx, 'UBS');
  await seedEarlyStart(t.ctx, ubs);
  const savings = await seedAccount(t.ctx, 'Savings');
  const [, , , , , , , , , split, transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-02-10', amountMinor: 50_000, classify: salary },
    { bookingDate: '2025-02-25', amountMinor: 50_000, classify: salary },
    { bookingDate: '2025-04-15', amountMinor: 100_000, classify: salary },
    { bookingDate: '2025-04-20', amountMinor: -20_000, classify: groceries },
    { bookingDate: '2025-05-05', amountMinor: -30_000, classify: groceries },
    { bookingDate: '2025-05-12', amountMinor: 5_000, classify: groceries },
    { bookingDate: '2025-03-01', amountMinor: -200_000, classify: property },
    { bookingDate: '2025-04-01', amountMinor: 80_000, classify: shares },
    { bookingDate: '2025-05-09', amountMinor: -7_000 },
    { bookingDate: '2025-03-10', amountMinor: -30_000 },
    { bookingDate: '2025-05-11', amountMinor: -50_000 },
  ]);
  const lines = await splitTransaction(t.ctx, split!, [
    { amountMinor: -20_000, categoryId: groceriesId },
    { amountMinor: -10_000, categoryId: groceriesId },
  ]);
  const [lineCredit, transferIn] = await seedClassified(t.ctx, savings, [
    { bookingDate: '2025-03-10', amountMinor: 10_000 },
    { bookingDate: '2025-05-11', amountMinor: 50_000 },
  ]);
  await linkTransfer(t.ctx, {
    sides: [splitLineSide(lines.splitLines[1]!.id), transactionSide(lineCredit!)],
  });
  await linkTransfer(t.ctx, {
    sides: [transactionSide(transferOut!), transactionSide(transferIn!)],
  });
}

const SINCE_MID_FEBRUARY: Period = { kind: 'custom', from: '2025-02-15' };

const amounts = (rows: readonly ProfitAndLossRow[]) => rows.map((row) => [row.label, row.value]);

const rowOf = (rows: readonly ProfitAndLossRow[], id: ProfitAndLossRow['id']) =>
  rows.find((row) => row.id === id)!;

/** Opens an Unclassified link as the Transactions list does, and sums what it lists. */
async function listed(href: string): Promise<{ total: number; sum: number }> {
  const url = new URL(href, 'http://localhost');
  expect(url.pathname).toBe('/transactions');
  const search = readTransactionSearch(Object.fromEntries(url.searchParams), 'apostrophe');
  const page = await listTransactions(t.ctx, search.query!);
  const sum = page.transactions.reduce((total, item) => total + item.amountMinor, 0);
  return { total: page.total, sum };
}

describe('Profit and loss', () => {
  it('reads Income, Expense, Profit, Capital, Unclassified and Net cash flow over the Period', async () => {
    fixToday('2025-05-20');
    await dataset();

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    // 1,500.00 in (the 10 February salary falls before the Period). Expense: 200.00 + 300.00 −
    // 50.00 refund + the split's 200.00 of groceries, shown positive. Capital nets the property
    // purchase and the share sale. The Transfer and the Split line moved to savings count nowhere.
    expect(amounts(rows)).toEqual([
      ['Income', 150_000],
      ['Expense', 65_000],
      ['Profit', 85_000],
      ['Capital', -120_000],
      ['Unclassified', -7_000],
      ['Net cash flow', -42_000],
    ]);
    expect(rows.map((row) => row.id)).toEqual([
      'income',
      'expense',
      'profit',
      'capital',
      'unclassified',
      'netCashFlow',
    ]);
  });

  it('has Net cash flow equal to the Net cash flow section over the same Period', async () => {
    fixToday('2025-05-20');
    await dataset();

    for (const period of [SINCE_MID_FEBRUARY, presetPeriod('quarter-to-date')]) {
      const { rows } = await loadSection(t.ctx, period, 'profitAndLoss');
      const section = await loadSection(t.ctx, period, 'netCashFlow');
      const [profit, capital, unclassified, net] = (
        ['profit', 'capital', 'unclassified', 'netCashFlow'] as const
      ).map((id) => rowOf(rows, id)?.value ?? 0);

      expect(net).toBe(section.data!.total);
      expect(net).toBe(profit! + capital! + unclassified!);
    }
  });

  it('follows the Period: Quarter to date leaves February and March out', async () => {
    fixToday('2025-05-20');
    await dataset();

    const { rows } = await loadSection(t.ctx, presetPeriod('quarter-to-date'), 'profitAndLoss');

    expect(amounts(rows)).toEqual([
      ['Income', 100_000],
      ['Expense', 45_000],
      ['Profit', 55_000],
      ['Capital', 80_000],
      ['Unclassified', -7_000],
      ['Net cash flow', 128_000],
    ]);
  });

  it('opens each row: its Drill-down over the Period, and the Unclassified Transactions list', async () => {
    fixToday('2025-05-20');
    await dataset();

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    const drilled: [string, number | null][] = [];
    for (const row of rows.filter((row) => row.id !== 'unclassified')) {
      const page = await openDrill(t.ctx, row.href);
      drilled.push([row.label, page.sumChfMinor]);
      expect(originOf(row.href), row.label).toEqual({
        kind: 'analytics',
        period: SINCE_MID_FEBRUARY,
      });
    }
    // Expense opens what went out, booked negative.
    expect(drilled).toEqual([
      ['Income', 150_000],
      ['Expense', -65_000],
      ['Profit', 85_000],
      ['Capital', -120_000],
      ['Net cash flow', -42_000],
    ]);

    const unclassified = rowOf(rows, 'unclassified');
    expect(unclassified.href).toBe('/transactions?from=2025-02-15&to=2025-05-20&unclassified=true');
    expect(await listed(unclassified.href)).toEqual({ total: 1, sum: -7_000 });
  });

  it('leaves the Unclassified row out when nothing is Unclassified', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
      { bookingDate: '2025-05-12', amountMinor: -30_000, classify: groceries },
    ]);

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    expect(amounts(rows)).toEqual([
      ['Income', 120_000],
      ['Expense', 30_000],
      ['Profit', 90_000],
      ['Capital', 0],
      ['Net cash flow', 90_000],
    ]);
  });

  it('shows the Unclassified row when its Transactions net to zero', async () => {
    fixToday('2025-05-20');
    const { salary } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // An Unclassified purchase and its refund.
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
      { bookingDate: '2025-05-11', amountMinor: -4_000 },
      { bookingDate: '2025-05-12', amountMinor: 4_000 },
    ]);

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    expect(amounts(rows)).toEqual([
      ['Income', 120_000],
      ['Expense', 0],
      ['Profit', 120_000],
      ['Capital', 0],
      ['Unclassified', 0],
      ['Net cash flow', 120_000],
    ]);
  });

  it('counts a first interval cut short only from the Period start', async () => {
    fixToday('2025-05-20');
    const { salary, groceries, property } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // The Period starts on 15 February, mid-month: the 14th falls before it, the 15th in it.
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-02-14', amountMinor: 70_000, classify: salary },
      { bookingDate: '2025-02-15', amountMinor: 40_000, classify: salary },
      { bookingDate: '2025-02-14', amountMinor: -9_000, classify: groceries },
      { bookingDate: '2025-02-16', amountMinor: -6_000, classify: groceries },
      { bookingDate: '2025-02-14', amountMinor: -50_000, classify: property },
      { bookingDate: '2025-02-28', amountMinor: -10_000, classify: property },
      { bookingDate: '2025-02-01', amountMinor: -3_000 },
      { bookingDate: '2025-02-20', amountMinor: -1_000 },
    ]);

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    expect(amounts(rows)).toEqual([
      ['Income', 40_000],
      ['Expense', 6_000],
      ['Profit', 34_000],
      ['Capital', -10_000],
      ['Unclassified', -1_000],
      ['Net cash flow', 23_000],
    ]);
  });

  it('shows CHF 0 rows for a Period with no Transactions', async () => {
    fixToday('2025-05-20');

    const { rows } = await loadSection(t.ctx, presetPeriod('quarter-to-date'), 'profitAndLoss');

    expect(amounts(rows)).toEqual([
      ['Income', 0],
      ['Expense', 0],
      ['Profit', 0],
      ['Capital', 0],
      ['Net cash flow', 0],
    ]);
    expect(rows.every((row) => row.unconverted === 0)).toBe(true);
  });

  it('flags each row some of whose Transactions could not be converted', async () => {
    fixToday('2025-05-20');
    const { salary, groceries, property } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // No EUR rate at all: every CA booking is left out.
    const ca = await seedAccount(t.ctx, 'CA', 'EUR');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
      { bookingDate: '2025-05-11', amountMinor: -40_000, classify: property },
    ]);
    await seedClassified(t.ctx, ca, [
      { bookingDate: '2025-05-12', amountMinor: -5_000, classify: groceries },
      { bookingDate: '2025-05-13', amountMinor: -1_000 },
    ]);

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    // The Unclassified payment can't be counted, yet the row shows so its flag isn't lost.
    expect(rows.map((row) => [row.id, row.value, row.unconverted])).toEqual([
      ['income', 120_000, 0],
      ['expense', 0, 1],
      ['profit', 120_000, 1],
      ['capital', -40_000, 0],
      ['unclassified', 0, 1],
      ['netCashFlow', 80_000, 2],
    ]);
  });
});

/** What a row's change says, its link aside: [id, amount, %, good]. */
const changes = (rows: readonly ProfitAndLossRow[]) =>
  rows.map((row) =>
    row.change === null
      ? [row.id, null]
      : [row.id, row.change.amount, row.change.percent, row.change.isGood],
  );

describe('Profit and loss change', () => {
  it('compares each row with the Comparison period, Capital and Unclassified neutral', async () => {
    // 15 Feb – 20 May against the 95 days before: only the 10 February salary falls there.
    fixToday('2025-05-20');
    await dataset();

    const { rows } = await loadSection(t.ctx, SINCE_MID_FEBRUARY, 'profitAndLoss');

    expect(changes(rows)).toEqual([
      ['income', 100_000, 2, true],
      // Nothing went out before: no %, and more spending is bad.
      ['expense', 65_000, null, false],
      ['profit', 35_000, 0.7, true],
      ['capital', -120_000, null, null],
      ['unclassified', -7_000, null, null],
      ['netCashFlow', -92_000, -1.84, false],
    ]);
    expect(rows.map((row) => [row.id, row.earlier])).toEqual([
      ['income', 50_000],
      ['expense', 0],
      ['profit', 50_000],
      ['capital', 0],
      ['unclassified', 0],
      ['netCashFlow', 50_000],
    ]);
    expect(rowOf(rows, 'income').change?.label).toBe('vs 12 Nov 2024 – 14 Feb');
  });

  it('gives no % against a zero or negative earlier value, and Capital and Unclassified going up stay neutral', async () => {
    fixToday('2025-05-20');
    await quarters();

    const { rows } = await loadSection(t.ctx, presetPeriod('quarter-to-date'), 'profitAndLoss');

    expect(changes(rows)).toEqual([
      ['income', 90_000, 9, true],
      ['expense', 10_000, 1 / 3, false],
      // A loss before: Profit is up, with no %.
      ['profit', 80_000, null, true],
      ['capital', 130_000, null, null],
      ['unclassified', 3_000, null, null],
      ['netCashFlow', 213_000, null, true],
    ]);
  });

  it('opens the Transactions of both stretches of days, and none between them', async () => {
    fixToday('2025-05-20');
    await quarters();

    const { rows } = await loadSection(t.ctx, presetPeriod('quarter-to-date'), 'profitAndLoss');

    const both: [string, number | null][] = [];
    for (const row of rows) {
      const page = await openDrill(t.ctx, row.change?.href);
      both.push([row.id, page.sumChfMinor]);
      expect(originOf(row.change!.href), row.id).toEqual({
        kind: 'analytics',
        period: presetPeriod('quarter-to-date'),
      });
    }
    expect(both).toEqual([
      ['income', 110_000],
      ['expense', -70_000],
      ['profit', 40_000],
      ['capital', 30_000],
      ['unclassified', -7_000],
      ['netCashFlow', 63_000],
    ]);
  });

  it('has no change on any row when the Account data does not reach back to the Comparison period', async () => {
    fixToday('2025-05-20');
    const { salary, property } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // The data starts on 5 April: after the Comparison period's start, 1 January.
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-04-05', amountMinor: 1_000, classify: salary },
      { bookingDate: '2025-05-15', amountMinor: -3_000, classify: property },
      { bookingDate: '2025-05-16', amountMinor: -2_000 },
    ]);

    const { rows } = await loadSection(t.ctx, presetPeriod('quarter-to-date'), 'profitAndLoss');

    expect(rows.map((row) => [row.id, row.earlier, row.change])).toEqual([
      ['income', null, null],
      ['expense', null, null],
      ['profit', null, null],
      ['capital', null, null],
      ['unclassified', null, null],
      ['netCashFlow', null, null],
    ]);
  });
});

/**
 * Quarter to date on 20 May 2025 (1 Apr – 20 May) against 1 Jan – 19 Feb. Before: 100.00 in,
 * 300.00 of groceries (a loss), 500.00 into property and a 50.00 Unclassified payment. Now:
 * 1,000.00 in, 400.00 of groceries, 800.00 from a share sale, a 20.00 Unclassified payment.
 * March, between the stretches, holds bookings of every kind.
 */
async function quarters(): Promise<void> {
  const { salary, groceries, property, shares } = await categories();
  const ubs = await seedAccount(t.ctx, 'UBS');
  await seedEarlyStart(t.ctx, ubs);
  await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-10', amountMinor: 10_000, classify: salary },
    { bookingDate: '2025-01-11', amountMinor: -30_000, classify: groceries },
    { bookingDate: '2025-02-01', amountMinor: -50_000, classify: property },
    { bookingDate: '2025-02-19', amountMinor: -5_000 },
    { bookingDate: '2025-03-05', amountMinor: 90_000, classify: salary },
    { bookingDate: '2025-03-06', amountMinor: -9_000, classify: groceries },
    { bookingDate: '2025-03-07', amountMinor: -40_000, classify: shares },
    { bookingDate: '2025-03-08', amountMinor: -4_000 },
    { bookingDate: '2025-04-10', amountMinor: 100_000, classify: salary },
    { bookingDate: '2025-04-11', amountMinor: -40_000, classify: groceries },
    { bookingDate: '2025-05-01', amountMinor: 80_000, classify: shares },
    { bookingDate: '2025-05-02', amountMinor: -2_000 },
  ]);
}

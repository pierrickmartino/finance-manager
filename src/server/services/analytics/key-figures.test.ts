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
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { linkTransfer, transactionSide } from '../transfers';
import type { KeyFigure } from './key-figures';

/** Analytics' Key figures (spec #225, user stories 1-11, 28-30, 33-35; ticket #228). */

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
 * with a 50.00 refund. In May also a property purchase (Capital), an Unclassified payment and a
 * Transfer out to savings, none of which is income or expense.
 */
async function dataset(): Promise<void> {
  const { salary, groceries, property } = await categories();
  const ubs = await seedAccount(t.ctx, 'UBS');
  const savings = await seedAccount(t.ctx, 'Savings');
  const ids = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2024-12-20', amountMinor: 80_000, classify: salary },
    { bookingDate: '2025-02-25', amountMinor: 50_000, classify: salary },
    { bookingDate: '2025-02-11', amountMinor: -40_000, classify: groceries },
    { bookingDate: '2025-04-15', amountMinor: 100_000, classify: salary },
    { bookingDate: '2025-04-20', amountMinor: -20_000, classify: groceries },
    { bookingDate: '2025-05-05', amountMinor: -30_000, classify: groceries },
    { bookingDate: '2025-05-12', amountMinor: 5_000, classify: groceries },
    { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
    { bookingDate: '2025-05-08', amountMinor: -200_000, classify: property },
    { bookingDate: '2025-05-09', amountMinor: -7_000 },
    { bookingDate: '2025-05-11', amountMinor: -50_000 },
  ]);
  const [transferIn] = await seedClassified(t.ctx, savings, [
    { bookingDate: '2025-05-11', amountMinor: 50_000 },
  ]);
  await linkTransfer(t.ctx, {
    sides: [transactionSide(ids.at(-1)!), transactionSide(transferIn!)],
  });
}

/** Every booking of the dataset, on both Accounts: Net worth today. */
const NET_WORTH_TODAY =
  80_000 + 50_000 - 40_000 + 100_000 - 20_000 - 30_000 + 5_000 + 120_000 - 200_000 - 7_000;

const amounts = (figures: readonly KeyFigure[]) =>
  figures.map((figure) => [figure.label, figure.value]);

/** Opens a figure's link and returns what its Transactions sum to, in CHF minor units. */
async function drilled(figure: KeyFigure): Promise<number> {
  const page = await openDrill(t.ctx, figure.href);
  return page.sumChfMinor ?? 0;
}

describe('Key figures', () => {
  it('by month, gives Net worth today and this month to date: income, expense and profit', async () => {
    fixToday('2025-05-20');
    await dataset();

    const section = await loadSection(t.ctx, MONTHLY, 'keyFigures');

    // May: 1,200.00 in; 300.00 of groceries less the 50.00 refund out. The property purchase,
    // the Unclassified payment and the Transfer count in neither.
    expect(amounts(section.figures)).toEqual([
      ['Net worth', NET_WORTH_TODAY],
      ['Income', 120_000],
      ['Expense', 25_000],
      ['Profit', 95_000],
    ]);
    expect(section.figures.map((figure) => figure.caption)).toEqual([
      'Today',
      'May 2025 to date',
      'May 2025 to date',
      'May 2025 to date',
    ]);
  });

  it('opens the Transactions behind each flow figure, and the Accounts as of today for Net worth', async () => {
    fixToday('2025-05-20');
    await dataset();

    const [netWorth, income, expense, profit] = (await loadSection(t.ctx, MONTHLY, 'keyFigures'))
      .figures as [KeyFigure, KeyFigure, KeyFigure, KeyFigure];

    expect(netWorth.href).toBe('/accounts?date=2025-05-20');
    expect(await drilled(income)).toBe(120_000);
    // Expense is shown as what went out: its Transactions are booked negative.
    expect(await drilled(expense)).toBe(-25_000);
    // Profit opens both: the salary, the groceries and the refund.
    const both = await openDrill(t.ctx, profit.href);
    expect(both.sumChfMinor).toBe(95_000);
    expect(both.total).toBe(3);
    expect(originOf(profit.href)).toEqual({ kind: 'analytics', span: MONTHLY });
  });

  it('by quarter and by year, reads the current quarter and year to date, Net worth unchanged', async () => {
    fixToday('2025-05-20');
    await dataset();

    const quarter = await loadSection(t.ctx, QUARTERLY, 'keyFigures');
    const year = await loadSection(t.ctx, YEARLY, 'keyFigures');

    // Q2: April and May. 2025: February too; December 2024 is in neither.
    expect(amounts(quarter.figures)).toEqual([
      ['Net worth', NET_WORTH_TODAY],
      ['Income', 220_000],
      ['Expense', 45_000],
      ['Profit', 175_000],
    ]);
    expect(amounts(year.figures)).toEqual([
      ['Net worth', NET_WORTH_TODAY],
      ['Income', 270_000],
      ['Expense', 85_000],
      ['Profit', 185_000],
    ]);
    expect(quarter.figures[1]!.caption).toBe('Q2 2025 to date');
    expect(year.figures[1]!.caption).toBe('2025 to date');
    for (const [span, section] of [
      [QUARTERLY, quarter],
      [YEARLY, year],
    ] as const) {
      for (const figure of section.figures.slice(1)) {
        const sign = figure.id === 'expense' ? -1 : 1;
        expect(await drilled(figure), figure.label).toBe(sign * figure.value);
        expect(originOf(figure.href)).toEqual({ kind: 'analytics', span });
      }
      expect(section.figures[0]!.href).toBe('/accounts?date=2025-05-20');
    }
  });

  it('shows CHF 0 for a period with no income, and a negative Profit', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-04-25', amountMinor: 100_000, classify: salary },
      { bookingDate: '2025-05-05', amountMinor: -30_000, classify: groceries },
    ]);

    const [, income, expense, profit] = (await loadSection(t.ctx, MONTHLY, 'keyFigures'))
      .figures as [KeyFigure, KeyFigure, KeyFigure, KeyFigure];

    expect([income.value, expense.value, profit.value]).toEqual([0, 30_000, -30_000]);
    expect(profit.label).toBe('Profit');
    expect(await drilled(income)).toBe(0);
    expect(await drilled(profit)).toBe(-30_000);
  });

  it('with no Accounts, has no Net worth to show and CHF 0 for the period', async () => {
    fixToday('2025-05-20');

    const section = await loadSection(t.ctx, MONTHLY, 'keyFigures');

    expect(section.figures.map((figure) => [figure.label, figure.value, figure.isEmpty])).toEqual([
      ['Net worth', 0, true],
      ['Income', 0, false],
      ['Expense', 0, false],
      ['Profit', 0, false],
    ]);
  });

  it('flags an unconverted expense on Expense and Profit, not Income', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    // No EUR rate at all: CA's balance and its purchase are left out.
    const ca = await seedAccount(t.ctx, 'CA', 'EUR');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-05-10', amountMinor: 120_000, classify: salary },
    ]);
    await seedClassified(t.ctx, ca, [
      { bookingDate: '2025-05-12', amountMinor: -5_000, classify: groceries },
    ]);

    const [netWorth, income, expense, profit] = (await loadSection(t.ctx, MONTHLY, 'keyFigures'))
      .figures as [KeyFigure, KeyFigure, KeyFigure, KeyFigure];

    expect(netWorth.unconverted).toEqual({ count: 1, counted: 'Account' });
    expect(netWorth.value).toBe(120_000);
    expect(expense.value).toBe(0);
    expect(income.unconverted).toEqual({ count: 0, counted: 'Transaction' });
    expect(expense.unconverted).toEqual({ count: 1, counted: 'Transaction' });
    expect(profit.unconverted).toEqual({ count: 1, counted: 'Transaction' });
  });

  it('flags an unconverted income on Income and Profit, not Expense', async () => {
    fixToday('2025-05-20');
    const { salary, groceries } = await categories();
    const ubs = await seedAccount(t.ctx, 'UBS');
    const ca = await seedAccount(t.ctx, 'CA', 'EUR');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2025-05-10', amountMinor: -30_000, classify: groceries },
    ]);
    await seedClassified(t.ctx, ca, [
      { bookingDate: '2025-05-12', amountMinor: 50_000, classify: salary },
    ]);

    const [, income, expense, profit] = (await loadSection(t.ctx, MONTHLY, 'keyFigures'))
      .figures as [KeyFigure, KeyFigure, KeyFigure, KeyFigure];

    expect(income.value).toBe(0);
    expect(income.unconverted.count).toBe(1);
    expect(expense.unconverted.count).toBe(0);
    expect(profit.unconverted.count).toBe(1);
  });
});

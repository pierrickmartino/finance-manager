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
import { readCard } from '@/lib/reporting/card';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { linkTransfer, transactionSide } from '../transfers';

/** Analytics' Net cash flow, the Dashboard's trend card (spec #170, ticket #173). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. A salary in January and March (to date), groceries in February, a
 * property purchase (Capital) in February, an uncategorised payment in March, and a Transfer
 * between the two Accounts in February that must count nowhere.
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
  const [, , , , , transferOut] = await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-25', amountMinor: 600_000, classify: as(salary) },
    { bookingDate: '2025-03-10', amountMinor: 300_000, classify: as(salary) },
    { bookingDate: '2025-02-05', amountMinor: -40_000, classify: as(groceries) },
    { bookingDate: '2025-02-15', amountMinor: -500_000, classify: as(property) },
    { bookingDate: '2025-03-12', amountMinor: -7_000 },
    { bookingDate: '2025-02-20', amountMinor: -250_000 },
  ]);
  const [transferIn] = await seedClassified(t.ctx, savings, [
    { bookingDate: '2025-02-20', amountMinor: 250_000 },
  ]);
  await linkTransfer(t.ctx, {
    sides: [transactionSide(transferOut!), transactionSide(transferIn!)],
  });
}

const money = String;

describe('Net cash flow', () => {
  it('is a trend card with one bar per month of the Period, Capital included and the Transfer left out', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'netCashFlow');
    const data = card.data!;

    expect(card.name).toBe('Net cash flow');
    expect(card.isEmpty).toBe(false);
    expect(readCard(card, money).kind).toBe('trend');
    expect(data.rows.map((row) => row.key)).toEqual([
      ...['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'],
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    // March 2024 is cut short at the Period's start, March 2025 runs to date.
    expect(data.rows.map((row) => row.isPartial)).toEqual([
      true,
      ...Array<boolean>(11).fill(false),
      true,
    ]);
    // February: groceries -400.00 and property -5,000.00; the Transfer adds nothing. March to
    // date: salary 3,000.00 and an uncategorised -70.00.
    expect(data.rowTotals).toEqual([...Array<null>(10).fill(null), 600_000, -540_000, 293_000]);
  });

  it('heads with the best net interval, then the weakest and the average of the complete ones', async () => {
    fixToday('2025-03-20');
    await dataset();

    const reading = readCard(await loadSection(t.ctx, MONTHLY, 'netCashFlow'), money);

    expect(reading.lead).toMatchObject({ headline: 'Best net month: Jan 2025', detail: '600000' });
    // March to date is left out of the average: 60'000 over 11 months, half away from zero.
    expect(reading.facts.map(({ label, value }) => [label, value])).toEqual([
      ['Weakest month: Feb 2025', '-540000'],
      ['Monthly average', '5455'],
    ]);
    expect(reading.mark.type).toBe('bars');
  });

  it('averages the complete intervals only, leaving out the partial first and the to-date last', async () => {
    fixToday('2025-03-20');
    await dataset();

    // From 20 January: January's salary falls in the partial first month and March's in the
    // to-date last; February, -5'400.00, is the only complete month.
    const card = await loadSection(t.ctx, { kind: 'custom', from: '2025-01-20' }, 'netCashFlow');

    expect(card.data!.rowTotals).toEqual([600_000, -540_000, 293_000]);
    const average = readCard(card, money).facts.at(-1)!;
    expect(average).toMatchObject({ label: 'Monthly average', value: '-540000' });
    expect((await openDrill(t.ctx, average.href)).value).toBe(-540_000);
  });

  it('shows no average when the Period has no complete interval', async () => {
    fixToday('2025-03-20');
    await dataset();

    // Rolling 30 days from 19 February: February cut short, March to date, neither complete.
    const card = await loadSection(t.ctx, presetPeriod('rolling-30-days'), 'netCashFlow');

    expect(card.data!.rows.map((row) => [row.key, row.isPartial])).toEqual([
      ['2025-02', true],
      ['2025-03', true],
    ]);
    expect(readCard(card, money).facts.at(-1)).toEqual({
      label: 'Monthly average',
      value: '—',
      href: null,
    });
  });

  it('follows Periods read by quarter and by year, Capital in and the Transfer out in each', async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarters = await loadSection(t.ctx, QUARTERLY, 'netCashFlow');
    const years = await loadSection(t.ctx, YEARLY, 'netCashFlow');

    expect(labels(quarters.data!.rows)).toEqual([
      ...['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025'],
    ]);
    expect(quarters.data!.rowTotals).toEqual([...Array<null>(4).fill(null), 353_000]);
    expect(quarters.data!.rows.at(-1)?.isPartial).toBe(true);
    expect(labels(years.data!.rows)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    expect(years.data!.rowTotals).toEqual([...Array<null>(4).fill(null), 353_000]);
    expect(readCard(years, money).facts.at(-1)).toMatchObject({ label: 'Yearly average' });
  });

  it('opens a Drill-down behind every bar and fact whose Transactions add up to it', async () => {
    fixToday('2025-03-20');
    await dataset();

    for (const view of [MONTHLY, QUARTERLY, YEARLY]) {
      const card = await loadSection(t.ctx, view, 'netCashFlow');
      for (const { value, href } of linkedValues(card.data!)) {
        expect(originOf(href)).toEqual({ kind: 'analytics', period: view });
        expect((await openDrill(t.ctx, href)).value).toBe(value);
      }
      // An interval with no Transaction reads 0 on the card.
      for (const fact of readCard(card, money).facts) {
        expect(String((await openDrill(t.ctx, fact.href)).value ?? 0)).toBe(fact.value);
      }
    }
  });

  it('is empty when no Transaction falls in the Period', async () => {
    fixToday('2025-03-20');

    const card = await loadSection(t.ctx, MONTHLY, 'netCashFlow');

    expect(card.isEmpty).toBe(true);
    expect(card.data!.rows).toHaveLength(13);
    expect(card.data!.rowTotals.every((total) => total === null)).toBe(true);
  });
});

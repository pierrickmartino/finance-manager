import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup } from '../categories';
import { listCellTransactions } from '../reporting';

/** Analytics' Spending Insights (spec #170, user stories 18-22; ticket #176). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

interface Booking {
  date: string;
  /** Signed CHF minor units: income positive, expense negative. */
  amount: number;
}

/** Bookings classified as income (positive) or expense (negative) on one Account. */
async function seed(bookings: Booking[]): Promise<void> {
  const pay = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const living = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const salary = await createCategory(t.ctx, { groupId: pay.id, name: 'Salary' });
  const groceries = await createCategory(t.ctx, { groupId: living.id, name: 'Groceries' });
  const account = await seedAccount(t.ctx, 'UBS');
  await seedClassified(
    t.ctx,
    account,
    bookings.map(({ date, amount }) => ({
      bookingDate: date,
      amountMinor: amount,
      classify: { categoryId: (amount > 0 ? salary : groceries).id },
    })),
  );
}

/**
 * Today is 20 March 2025. Spending of 600.00 in June 2023, 200.00 in August 2024, 100.00 in
 * December 2024, 300.00 in January, 400.00 in February and 50.00 in March (to date). Income of
 * 1,500.00 in June 2023, 500.00 in December 2024 and 1,000.00 in each of January, February and
 * March.
 */
const DATASET: Booking[] = [
  { date: '2023-06-12', amount: -60_000 },
  { date: '2023-06-25', amount: 150_000 },
  { date: '2024-08-08', amount: -20_000 },
  { date: '2024-12-09', amount: -10_000 },
  { date: '2024-12-24', amount: 50_000 },
  { date: '2025-01-14', amount: -30_000 },
  { date: '2025-01-25', amount: 100_000 },
  { date: '2025-02-11', amount: -40_000 },
  { date: '2025-02-25', amount: 100_000 },
  { date: '2025-03-05', amount: -5_000 },
  { date: '2025-03-10', amount: 100_000 },
];

describe('Spending Insights', () => {
  it('in Month, sets the latest complete month against the complete months before it', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    const { insight } = await loadSection(t.ctx, 'month', 'spendingInsights');

    // The months with data start in August: 200, 0, 0, 0, 100 and 300 average 100.00, so
    // February's 400.00 is 300% above. Income 2,500.00 against spending 1,000.00 from August to
    // February: 60% kept. March, to date, is not judged.
    expect(insight).toMatchObject({
      headline: 'Spending is running high.',
      detail: [
        'Feb 2025 came in ',
        '300% above',
        ' your monthly average, and you kept 60% of everything that came in.',
      ],
      latest: { value: 40_000 },
      average: 10_000,
    });
  });

  it('in Quarter and Year, names the view and reads the complete periods of its window', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    const quarters = await loadSection(t.ctx, 'quarter', 'spendingInsights');
    const years = await loadSection(t.ctx, 'year', 'spendingInsights');

    // Quarters from Q2 2023: 600, 0, 0, 0, 0 and 200 average 133.33, so Q4 2024's 100.00 is 25%
    // below. Income 2,000.00 against spending 900.00 over them: 55% kept.
    expect(quarters.insight).toMatchObject({
      headline: 'Spending is easing.',
      detail: [
        'Q4 2024 came in ',
        '25% below',
        ' your quarterly average, and you kept 55% of everything that came in.',
      ],
      latest: { value: 10_000 },
      average: 13_333,
    });
    // Years from 2023: 2024's 300.00 against 2023's 600.00 is 50% below.
    expect(years.insight).toMatchObject({
      headline: 'Spending is easing.',
      detail: [
        '2024 came in ',
        '50% below',
        ' your yearly average, and you kept 55% of everything that came in.',
      ],
      latest: { value: 30_000 },
      average: 60_000,
    });
  });

  it('draws every period of the window, the current one to date and not judged', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    const { bars, insight } = await loadSection(t.ctx, 'month', 'spendingInsights');

    expect(bars.map((bar) => [bar.label, bar.expense, bar.isLatest, bar.isToDate])).toEqual([
      ['Apr 2024', 0, false, false],
      ['May 2024', 0, false, false],
      ['Jun 2024', 0, false, false],
      ['Jul 2024', 0, false, false],
      ['Aug 2024', 20_000, false, false],
      ['Sep 2024', 0, false, false],
      ['Oct 2024', 0, false, false],
      ['Nov 2024', 0, false, false],
      ['Dec 2024', 10_000, false, false],
      ['Jan 2025', 30_000, false, false],
      ['Feb 2025', 40_000, true, false],
      ['Mar 2025', 5_000, false, true],
    ]);
    // February is the tallest; the average line sits at a quarter of it.
    expect(bars.find((bar) => bar.isLatest)?.share).toBe(1);
    expect(insight?.averageShare).toBe(0.25);
  });

  it('gives no insight with fewer than two complete periods with data, in every view', async () => {
    fixToday('2025-03-20');
    // February is the only complete month with data; in Quarter and Year both fall in the
    // current period, so no complete one has any.
    await seed([
      { date: '2025-02-11', amount: -40_000 },
      { date: '2025-03-05', amount: -5_000 },
    ]);

    for (const view of ['month', 'quarter', 'year'] as const) {
      const section = await loadSection(t.ctx, view, 'spendingInsights');
      expect(section.insight, view).toBeNull();
      expect(section.isEmpty).toBe(false);
      expect(section.bars.at(-1)).toMatchObject({
        isToDate: true,
        expense: view === 'month' ? 5_000 : 45_000,
      });
    }
  });

  it('is empty with no income or expense in the window', async () => {
    fixToday('2025-03-20');

    const section = await loadSection(t.ctx, 'quarter', 'spendingInsights');

    expect(section).toMatchObject({ insight: null, isEmpty: true });
    expect(section.bars).toHaveLength(8);
  });

  it('opens a Drill-down behind every bar, the latest period and the change', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    for (const view of ['month', 'quarter', 'year'] as const) {
      const { bars, insight } = await loadSection(t.ctx, view, 'spendingInsights');
      for (const bar of bars) {
        const page = await listCellTransactions(t.ctx, bar.drill.query, bar.drill.cell);
        expect(page.value ?? 0, `${view} ${bar.label}`).toBe(0 - bar.expense);
      }
      const { latest, change } = insight!;
      const latestPage = await listCellTransactions(t.ctx, latest.drill.query, latest.drill.cell);
      expect(latestPage.value).toBe(0 - latest.value!);
      // The change's working: every complete period's spending, subtotalled per period.
      const working = await listCellTransactions(t.ctx, change.query, change.cell);
      const complete = bars.filter((bar) => !bar.isToDate);
      const subtotals = new Map(
        working.subtotals?.map((period) => [period.key, period.sumChfMinor]),
      );
      expect(complete.map((bar) => [bar.key, subtotals.get(bar.key) ?? 0])).toEqual(
        complete.map((bar) => [bar.key, 0 - bar.expense]),
      );
      expect(working.sumChfMinor).toBe(0 - complete.reduce((total, bar) => total + bar.expense, 0));
    }
  });
});

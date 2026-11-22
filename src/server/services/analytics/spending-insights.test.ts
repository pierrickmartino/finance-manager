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

import { spanLabel, type Span } from '@/lib/analytics/span';
import { readCard } from '@/lib/reporting/card';
import { spendingBars, spendingInsight } from '@/lib/reporting/overview';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup } from '../categories';

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

const money = String;

/** The insight the Dashboard's insight card tells from a section's flow, and the flow itself. */
async function insightAt(view: Span) {
  const card = await loadSection(t.ctx, view, 'spendingInsights');
  const { flow } = readCard(card, money);
  return { card, flow, insight: flow && spendingInsight(flow.months, flow.period) };
}

describe('Spending Insights', () => {
  it('by month, sets the latest complete month against the complete months before it', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    const { card, flow, insight } = await insightAt(MONTHLY);

    expect(card.name).toBe('Spending Insights');
    expect(flow?.period).toBe('month');
    // The months with data start in August: 200, 0, 0, 0, 100 and 300 average 100.00, so
    // February's 400.00 is 300% above. Income 2,500.00 against spending 1,000.00 from August to
    // February: 60% kept. March, to date, is not judged.
    expect(insight).toEqual({
      headline: 'Spending is running high.',
      detail: [
        'Feb 2025 came in ',
        '300% above',
        ' your monthly average, and you kept 60% of everything that came in.',
      ],
    });
  });

  it('by quarter and by year, names the grain and reads the complete periods of the Span', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    const quarters = await insightAt(QUARTERLY);
    const years = await insightAt(YEARLY);

    // Quarters from Q1 2024, from the first with data on: Q3 2024's 200.00, so Q4 2024's 100.00
    // is 50% below. Income 500.00 against spending 300.00 over them: 40% kept.
    expect(quarters.insight?.detail).toEqual([
      'Q4 2024 came in ',
      '50% below',
      ' your quarterly average, and you kept 40% of everything that came in.',
    ]);
    expect(quarters.insight?.headline).toBe('Spending is easing.');
    // Years from 2021, from the first with data on, 2023: 2024's 300.00 against 2023's 600.00 is 50% below.
    expect(years.insight?.detail).toEqual([
      '2024 came in ',
      '50% below',
      ' your yearly average, and you kept 55% of everything that came in.',
    ]);
  });

  it('charts the complete periods from the first with data, against the average of the ones before the latest', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    const { flow } = await insightAt(MONTHLY);
    const chart = spendingBars(flow!.months)!;

    expect(chart.bars.map((bar) => [bar.label, bar.expense, bar.isLatest])).toEqual([
      ['Aug 2024', 20_000, false],
      ['Sep 2024', 0, false],
      ['Oct 2024', 0, false],
      ['Nov 2024', 0, false],
      ['Dec 2024', 10_000, false],
      ['Jan 2025', 30_000, false],
      ['Feb 2025', 40_000, true],
    ]);
    // February is the tallest; the average line sits at a quarter of it.
    expect(chart.averageShare).toBe(0.25);
    // March is still running: in the flow, never charted nor judged.
    expect(flow!.months.at(-1)).toMatchObject({
      label: 'Mar 2025',
      isPartial: true,
      expense: 5_000,
    });
  });

  it('gives no insight with fewer than two complete periods with data, at every grain', async () => {
    fixToday('2025-03-20');
    // February is the only complete month with data; by quarter and by year both fall in the
    // current period, so no complete one has any.
    await seed([
      { date: '2025-02-11', amount: -40_000 },
      { date: '2025-02-25', amount: 100_000 },
      { date: '2025-03-05', amount: -5_000 },
    ]);

    for (const view of [MONTHLY, QUARTERLY, YEARLY]) {
      const { card, insight } = await insightAt(view);
      expect(insight, spanLabel(view)).toBeNull();
      expect(card.isEmpty).toBe(false);
    }
  });

  it('is empty with no income or expense in the Span', async () => {
    fixToday('2025-03-20');

    const { card, flow } = await insightAt(QUARTERLY);

    expect(card.isEmpty).toBe(true);
    expect(flow).toBeNull();
  });

  it('opens a Drill-down behind the change and the latest complete period, back to Analytics', async () => {
    fixToday('2025-03-20');
    await seed(DATASET);

    for (const view of [MONTHLY, QUARTERLY, YEARLY]) {
      const { card, flow } = await insightAt(view);
      const complete = flow!.months.filter((month) => !month.isPartial);
      // "See the Transactions": the latest complete period's income and expense.
      const latest = await openDrill(t.ctx, flow!.latestHref);
      expect(latest.value).toBe(complete.at(-1)!.net);
      expect(originOf(flow!.latestHref!)).toEqual({ kind: 'analytics', span: view });
      // The change's working: every complete period's spending, subtotalled per period.
      const working = await openDrill(t.ctx, flow!.changeHref);
      expect(working.sumChfMinor).toBe(0 - complete.reduce((sum, month) => sum + month.expense, 0));
      const current = card.data!.rows.at(-1)!;
      expect(current.isPartial).toBe(true);
      expect(working.subtotals?.map((period) => period.key)).not.toContain(current.key);
    }
  });
});

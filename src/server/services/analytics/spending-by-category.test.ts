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
  type ClassifiedRow,
} from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/periods';
import { presetPeriod } from '@/lib/analytics/period';
import { setupTestDatabase } from '@test/support/db';
import { createCategory, createCategoryGroup } from '../categories';
import { readCard } from '@/lib/reporting/card';

/** Analytics' Spending by Category, the Dashboard's ranking card (spec #170, ticket #174). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/** Expense Categories with their bookings in Rolling 12 months, and a salary that never counts. */
const SPENDING: Record<string, [string, number][]> = {
  Rent: [
    ['2025-01-05', -50_000],
    ['2025-03-05', -50_000],
  ],
  Groceries: [
    ['2025-01-12', -40_000],
    ['2025-02-12', -50_000],
  ],
  Travel: [['2025-02-08', -80_000]],
  Health: [['2025-01-18', -70_000]],
  Insurance: [['2025-02-01', -60_000]],
  Dining: [
    ['2025-01-22', -30_000],
    ['2025-02-22', -20_000],
  ],
  Phone: [['2025-03-02', -40_000]],
  // -450.00 with a 150.00 refund: 300.00, so it ranks below Phone (400.00), not above.
  Books: [
    ['2025-02-14', -45_000],
    ['2025-02-16', 15_000],
  ],
  Gifts: [['2025-01-25', -25_000]],
  Hobbies: [
    ['2025-01-28', -12_000],
    ['2025-03-08', -8_000],
  ],
};

/** Today is 20 March 2025. Seeds the Categories under one expense group, plus a salary. */
async function dataset(names = Object.keys(SPENDING)): Promise<void> {
  const food = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
  const pay = await createCategoryGroup(t.ctx, { name: 'Pay', type: 'income' });
  const salary = await createCategory(t.ctx, { groupId: pay.id, name: 'Salary' });
  const ubs = await seedAccount(t.ctx, 'UBS');
  await seedEarlyStart(t.ctx, ubs);
  const rows: ClassifiedRow[] = [
    { bookingDate: '2025-01-25', amountMinor: 900_000, classify: { categoryId: salary.id } },
  ];
  for (const name of names) {
    const category = await createCategory(t.ctx, { groupId: food.id, name });
    for (const [bookingDate, amountMinor] of SPENDING[name]!) {
      rows.push({
        bookingDate,
        amountMinor,
        rawDescription: `${name} ${bookingDate}`,
        classify: { categoryId: category.id },
      });
    }
  }
  await seedClassified(t.ctx, ubs, rows);
}

const money = String;

const empty = Array<null>(10).fill(null);

describe('Spending by Category', () => {
  it('is a ranking card of the 6 largest Expense Categories over the Period, with their share of all spending', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'spendingByCategory');
    const reading = readCard(card, money);

    expect(card.name).toBe('Spending by Category');
    expect(card.isEmpty).toBe(false);
    expect(reading.kind).toBe('ranking');
    // All spending: -5'650.00. As on the Dashboard, a chart names its 7 largest series and
    // folds the rest into Other, which ranks too: Books (-300.00 net of its refund), Gifts and
    // Hobbies.
    expect(reading.mark).toMatchObject({
      type: 'ticks',
      items: [
        { title: 'Rent', detail: 'Living · -100000', share: 100_000 / 565_000 },
        { title: 'Groceries', detail: 'Living · -90000', share: 90_000 / 565_000 },
        { title: 'Travel', detail: 'Living · -80000', share: 80_000 / 565_000 },
        { title: 'Other', detail: '-75000', share: 75_000 / 565_000 },
        { title: 'Health', detail: 'Living · -70000', share: 70_000 / 565_000 },
        { title: 'Insurance', detail: 'Living · -60000', share: 60_000 / 565_000 },
      ],
    });
    expect(reading.lead).toMatchObject({ headline: 'Rent leads', detail: '-100000' });
  });

  it('names the heaviest and lightest intervals and the average of the complete ones', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'spendingByCategory');

    // January -2'270.00, February -2'400.00, March to date -980.00; the months before, nothing.
    // The average leaves out March 2025 to date and March 2024, cut short at the Period's start:
    // -4'670.00 over 11 months, rounded half away from zero.
    expect(readCard(card, money).facts.map(({ label, value }) => [label, value])).toEqual([
      ['Heaviest month: Feb 2025', '-240000'],
      ['Lightest month: Mar 2025 (partial)', '-98000'],
      ['Monthly average', '-42455'],
    ]);
    expect(card.data!.rows).toHaveLength(13);
    expect(card.data!.rows[0]).toMatchObject({ key: '2024-03', isPartial: true });
    expect(card.data!.rows.at(-1)).toMatchObject({ key: '2025-03', isPartial: true });
  });

  it('opens a Drill-down behind every Category, interval and fact, back to Analytics', async () => {
    fixToday('2025-03-20');
    await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'spendingByCategory');
    const reading = readCard(card, money);

    for (const { value, href } of linkedValues(card.data!)) {
      expect(originOf(href)).toEqual({
        kind: 'analytics',
        page: { period: MONTHLY, cardPeriods: {} },
      });
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
    const items = reading.mark.type === 'ticks' ? reading.mark.items : [];
    const ranked = await Promise.all(items.map((item) => openDrill(t.ctx, item.href)));
    expect(ranked.map((page) => page.value)).toEqual([
      -100_000, -90_000, -80_000, -75_000, -70_000, -60_000,
    ]);
    const facts = await Promise.all(reading.facts.map((fact) => openDrill(t.ctx, fact.href)));
    expect(facts.map((page) => page.value)).toEqual([-240_000, -98_000, -42_455]);
  });

  it('reads the Period by quarter, the current quarter to date', async () => {
    fixToday('2025-03-20');
    await dataset(['Rent', 'Groceries', 'Books']);

    const card = await loadSection(t.ctx, QUARTERLY, 'spendingByCategory');
    const data = card.data!;

    expect(readCard(card, money).kind).toBe('ranking');
    expect(data.rows.map((row) => row.key)).toEqual([
      ...['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1'],
    ]);
    expect(data.rows.at(-1)?.isPartial).toBe(true);
    expect(labels(data.columns)).toEqual(['Living › Rent', 'Living › Groceries', 'Living › Books']);
    expect(data.cells.map((row) => row[0])).toEqual([...Array<null>(4).fill(null), -100_000]);
  });

  it('is drawn as bars per interval, as on the Dashboard, with fewer than 3 Expense Categories', async () => {
    fixToday('2025-03-20');
    await dataset(['Rent', 'Groceries']);

    const card = await loadSection(t.ctx, MONTHLY, 'spendingByCategory');

    expect(readCard(card, money).kind).toBe('bars');
    expect(card.data!.cells.map((row) => row[0])).toEqual([...empty, -50_000, null, -50_000]);
  });

  it('is empty when no expense falls in the Period', async () => {
    fixToday('2025-03-20');

    const card = await loadSection(t.ctx, YEARLY, 'spendingByCategory');

    expect(card.isEmpty).toBe(true);
    expect(card.data!.columns).toEqual([]);
    expect(card.data!.rows).toHaveLength(5);
  });

  it('pinned, ranks the Categories over its own Period, each Drill-down over it and back to the page', async () => {
    fixToday('2025-03-20');
    await dataset(['Rent', 'Groceries', 'Books']);
    const pins = { 'spending-by-category': 'year-to-date' } as const;

    const card = await loadSection(t.ctx, MONTHLY, 'spendingByCategory', pins);

    expect(card.isPinned).toBe(true);
    expect(card.reading).toMatchObject({
      period: presetPeriod('year-to-date'),
      from: '2025-01-01',
      to: '2025-03-20',
      grain: 'month',
    });
    expect(card.data!.rows.map((row) => row.key)).toEqual(['2025-01', '2025-02', '2025-03']);
    // Year to date: Rent -1'000.00, Groceries -900.00, Books -300.00 net of its refund.
    expect(card.data!.total).toBe(-220_000);
    for (const { value, href } of linkedValues(card.data!)) {
      expect(originOf(href)).toEqual({
        kind: 'analytics',
        page: { period: MONTHLY, cardPeriods: pins },
      });
      expect((await openDrill(t.ctx, href)).value).toBe(value);
    }
  });

  it('unpinned, reads the page Period and says so', async () => {
    fixToday('2025-03-20');
    await dataset(['Rent']);

    const card = await loadSection(t.ctx, MONTHLY, 'spendingByCategory');

    expect(card.isPinned).toBe(false);
    expect(card.reading).toMatchObject({ period: MONTHLY, from: '2024-03-21' });
  });

  it('pinned, names its own Period in words for its sentence; unpinned, names none', async () => {
    fixToday('2025-03-20');
    await dataset(['Rent']);

    const pinned = await loadSection(t.ctx, MONTHLY, 'spendingByCategory', {
      'spending-by-category': 'this-year-and-last-1',
    });
    const unpinned = await loadSection(t.ctx, MONTHLY, 'spendingByCategory');

    expect(pinned.periodName).toBe('This year and last 1');
    expect(unpinned.periodName).toBeNull();
  });
});

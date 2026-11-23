import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, openDrill, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { DEFAULT_PERIOD, presetPeriod, type Period } from '@/lib/analytics/period';
import { createAccount } from '@/server/services/accounts';
import { createBank } from '@/server/services/banks';
import { createCategory, createCategoryGroup } from '@/server/services/categories';
import { loadAnalytics, type AnalyticsSections, type AnalyticsView } from '.';

/** The page as a whole: the reading (the Period resolved once) every section reads. */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/** The view once every section has loaded, so no query outlives the test. */
async function settled(
  analytics: AnalyticsView,
): Promise<Omit<AnalyticsView, 'sections'> & { sections: Loaded }> {
  const entries = await Promise.all(
    Object.entries(analytics.sections).map(async ([name, section]) => [name, await section]),
  );
  return { ...analytics, sections: Object.fromEntries(entries) as Loaded };
}

type Loaded = { [Name in keyof AnalyticsSections]: Awaited<AnalyticsSections[Name]> };

const keys = (intervals: { key: string | null }[]) => intervals.map((interval) => interval.key);
const custom = (from: string): Period => ({ kind: 'custom', from });
const flags = (intervals: { isPartial: boolean }[]) =>
  intervals.map((interval) => interval.isPartial);

describe('a custom Period', () => {
  it('reads from its start date to today, by the grain its length gives', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2024-01-05', amountMinor: -1_000 }]);

    const { reading } = await settled(await loadAnalytics(t.ctx, custom('2024-06-15')));

    expect(reading).toMatchObject({ period: custom('2024-06-15'), from: '2024-06-15' });
    expect(reading.grain).toBe('month');
    expect(reading.intervals[0]).toMatchObject({ key: '2024-06', isPartial: true });
  });

  it('is clamped to the first Transaction, and the effective Period returned', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-09-10', amountMinor: -4_000 },
      { bookingDate: '2025-02-01', amountMinor: 6_000 },
    ]);

    const { reading, sections } = await settled(await loadAnalytics(t.ctx, custom('2020-01-01')));

    expect(reading).toMatchObject({ period: custom('2024-09-10'), from: '2024-09-10' });
    expect(reading.grain).toBe('month');
    expect(keys(reading.intervals)).toEqual([
      ...['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    // Every section reads the clamped Period.
    expect(keys(sections.netCashFlow.data!.rows)).toEqual(keys(reading.intervals));
    expect(sections.netCashFlow.data!.total).toBe(2_000);
  });

  it('is left as typed when it starts on or after the first Transaction, or there is none', async () => {
    fixToday('2025-03-20');

    expect((await settled(await loadAnalytics(t.ctx, custom('2020-01-01')))).reading.from).toBe(
      '2020-01-01',
    );
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2024-09-10', amountMinor: -4_000 }]);
    expect((await settled(await loadAnalytics(t.ctx, custom('2024-09-10')))).reading.from).toBe(
      '2024-09-10',
    );
  });
});

describe('a preset Period', () => {
  it('starts no earlier than the first Transaction, keeping its preset name', async () => {
    fixToday('2025-03-20');
    // Opened long before its first Transaction, so the change lines reach back.
    const bank = await createBank(t.ctx, { name: 'UBS' });
    const ubs = await createAccount(t.ctx, {
      bankId: bank.id,
      name: 'UBS',
      currency: 'CHF',
      iban: null,
      kind: 'current',
      importFormat: 'ubs_csv',
      openingBalanceMinor: 0,
      openingDate: '2020-01-01',
    });
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-09-10', amountMinor: -4_000 },
      { bookingDate: '2025-02-01', amountMinor: 6_000 },
    ]);

    const { reading, starts, sections } = await settled(
      await loadAnalytics(t.ctx, presetPeriod('this-year-and-last-4')),
    );

    expect(reading).toMatchObject({
      period: presetPeriod('this-year-and-last-4'),
      from: '2024-09-10',
      grain: 'month',
    });
    expect(keys(reading.intervals)[0]).toBe('2024-09');
    // Picking a preset fills in the start it is read from.
    expect(starts).toMatchObject({
      'this-year-and-last-4': '2024-09-10',
      'rolling-12-months': '2024-09-10',
      'rolling-30-days': '2025-02-19',
    });
    // Its figures are captioned with the clamped start, not the preset's.
    const income = sections.keyFigures.figures.find((figure) => figure.id === 'income')!;
    expect(income.caption).toBe('10 Sep 2024 – today');
    // Read from a later start than its preset gives: compared with as many days just before.
    expect(income.change?.label).toBe('vs 2 Mar – 9 Sep 2024');
  });

  it('is read as named when it starts on or after the first Transaction', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2020-05-01', amountMinor: -1_000 }]);

    const { reading, sections } = await settled(
      await loadAnalytics(t.ctx, presetPeriod('year-to-date')),
    );

    expect(reading.from).toBe('2025-01-01');
    const income = sections.keyFigures.figures.find((figure) => figure.id === 'income')!;
    expect(income.caption).toBe('Year to date');
    expect(income.change?.label).toBe('vs 1 Jan – 20 Mar 2024');
  });
});

describe('the reading', () => {
  it('opens on Rolling 12 months by month, its first month cut short and the last to date', async () => {
    fixToday('2025-03-20');

    const { reading, sections } = await settled(await loadAnalytics(t.ctx, DEFAULT_PERIOD));
    const { intervals } = reading;

    expect(reading).toMatchObject({
      period: presetPeriod('rolling-12-months'),
      from: '2024-03-21',
      to: '2025-03-20',
      grain: 'month',
    });
    expect(keys(intervals)).toEqual([
      ...['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'],
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    expect(intervals[0]).toEqual({
      key: '2024-03',
      label: 'Mar 2024',
      isToDate: false,
      isPartial: true,
    });
    expect(intervals.at(-1)).toEqual({
      key: '2025-03',
      label: 'Mar 2025',
      isToDate: true,
      isPartial: false,
    });
    expect(intervals.slice(1, -1).every((p) => !p.isPartial && !p.isToDate)).toBe(true);
    // Every per-interval card covers the Period at its grain, both ends set apart.
    const columns = sections.profitPerInterval.data!.columns;
    const rows = sections.netCashFlow.data!.rows;
    expect(keys(columns)).toEqual(keys(intervals));
    expect(keys(rows)).toEqual(keys(intervals));
    for (const headers of [columns, rows, sections.spendingByCategory.data!.rows]) {
      expect(flags(headers)).toEqual([true, ...Array<boolean>(11).fill(false), true]);
    }
  });

  it('is split by quarter up to 24 months and by year beyond', async () => {
    fixToday('2025-03-20');

    const quarterly = (
      await settled(await loadAnalytics(t.ctx, presetPeriod('this-year-and-last-1')))
    ).reading;
    const yearly = (await settled(await loadAnalytics(t.ctx, presetPeriod('this-year-and-last-4'))))
      .reading;

    expect(quarterly).toMatchObject({ from: '2024-01-01', grain: 'quarter' });
    expect(keys(quarterly.intervals)).toEqual([
      '2024-Q1',
      '2024-Q2',
      '2024-Q3',
      '2024-Q4',
      '2025-Q1',
    ]);
    expect(yearly).toMatchObject({ from: '2021-01-01', grain: 'year' });
    expect(keys(yearly.intervals)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    // Both start on an interval's first day: nothing is cut short, the last is to date.
    for (const { intervals } of [quarterly, yearly]) {
      expect(intervals.map((p) => [p.isPartial, p.isToDate])).toEqual([
        ...intervals.slice(0, -1).map(() => [false, false]),
        [false, true],
      ]);
    }
  });

  it("counts only the Period's days in its first interval, so its intervals add up to its total", async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      // Before the Period: the same month, but not its days.
      { bookingDate: '2024-03-20', amountMinor: -90_000 },
      { bookingDate: '2024-03-21', amountMinor: -10_000 },
      { bookingDate: '2024-07-15', amountMinor: 50_000 },
      { bookingDate: '2025-03-20', amountMinor: 3_000 },
    ]);

    const { sections } = await settled(await loadAnalytics(t.ctx, DEFAULT_PERIOD));
    const data = sections.netCashFlow.data!;

    expect(data.rowTotals[0]).toBe(-10_000);
    expect(data.total).toBe(43_000);
    expect(data.rowTotals.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(43_000);
    // The first interval's Drill-down lists the Period's days of it only.
    const page = await openDrill(t.ctx, data.hrefs.rowTotals[0]);
    expect(page.span).toEqual({ from: '2024-03-21', to: '2024-03-31' });
    expect(page.value).toBe(-10_000);
    expect(page.transactions.map((row) => row.chfMinor)).toEqual([-10_000]);
  });
});

describe('a Card Period', () => {
  it('reads a pinned section over its own Period while every other section follows the page', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2023-06-10', amountMinor: -4_000 },
      { bookingDate: '2025-02-01', amountMinor: -6_000 },
    ]);
    const pins = { 'spending-by-category': 'this-year-and-last-1' } as const;

    const { reading, sections } = await settled(
      await loadAnalytics(t.ctx, presetPeriod('year-to-date'), pins),
    );

    expect(reading).toMatchObject({ period: presetPeriod('year-to-date'), from: '2025-01-01' });
    const spending = sections.spendingByCategory;
    expect(spending).toMatchObject({ isPinned: true });
    expect(spending.reading).toMatchObject({
      period: presetPeriod('this-year-and-last-1'),
      from: '2024-01-01',
      grain: 'quarter',
    });
    expect(keys(spending.data!.rows)).toEqual([
      ...['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1'],
    ]);
    // The others, and the Key figures, read the page's Period.
    const pageIntervals = ['2025-01', '2025-02', '2025-03'];
    expect(keys(sections.netCashFlow.data!.rows)).toEqual(pageIntervals);
    for (const card of [sections.profitPerInterval, sections.categoriesPerInterval]) {
      expect(keys(card.data!.columns)).toEqual(pageIntervals);
    }
    expect(sections.netCashFlow.data!.total).toBe(-6_000);
    expect(sections.keyFigures.figures.find((figure) => figure.id === 'expense')).toMatchObject({
      caption: 'Year to date',
    });
  });

  it('clamps a pin to the first Transaction like any Period, beside a custom page Period', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    const living = await createCategoryGroup(t.ctx, { name: 'Living', type: 'expense' });
    const rent = await createCategory(t.ctx, { groupId: living.id, name: 'Rent' });
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-09-10', amountMinor: -4_000, classify: { categoryId: rent.id } },
      { bookingDate: '2025-02-01', amountMinor: -6_000, classify: { categoryId: rent.id } },
    ]);
    const pins = { 'spending-by-category': 'this-year-and-last-4' } as const;

    const { reading, sections } = await settled(
      await loadAnalytics(t.ctx, custom('2025-02-01'), pins),
    );

    expect(reading).toMatchObject({ period: custom('2025-02-01'), from: '2025-02-01' });
    const spending = sections.spendingByCategory;
    expect(spending.reading).toMatchObject({ from: '2024-09-10', grain: 'month' });
    expect(keys(spending.data!.rows)).toEqual([
      ...['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    expect(spending.data!.total).toBe(-10_000);
    expect(keys(sections.netCashFlow.data!.rows)).toEqual(['2025-02', '2025-03']);
  });
});

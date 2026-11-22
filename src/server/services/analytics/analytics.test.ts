import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, openDrill, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { DEFAULT_SPAN, presetSpan, type Span } from '@/lib/analytics/span';
import { loadAnalytics, type AnalyticsSections, type AnalyticsView } from '.';

/** The page as a whole: the reading (the Span resolved once) every section reads. */

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

const keys = (periods: { key: string | null }[]) => periods.map((period) => period.key);
const custom = (from: string): Span => ({ kind: 'custom', from });
const flags = (periods: { isPartial: boolean }[]) => periods.map((period) => period.isPartial);

describe('a custom Span', () => {
  it('reads from its start date to today, by the grain its length gives', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2024-01-05', amountMinor: -1_000 }]);

    const { reading } = await settled(await loadAnalytics(t.ctx, custom('2024-06-15')));

    expect(reading).toMatchObject({ span: custom('2024-06-15'), from: '2024-06-15' });
    expect(reading.grain).toBe('month');
    expect(reading.periods[0]).toMatchObject({ key: '2024-06', isPartial: true });
  });

  it('is clamped to the first Transaction, and the effective Span returned', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2024-09-10', amountMinor: -4_000 },
      { bookingDate: '2025-02-01', amountMinor: 6_000 },
    ]);

    const { reading, sections } = await settled(await loadAnalytics(t.ctx, custom('2020-01-01')));

    expect(reading).toMatchObject({ span: custom('2024-09-10'), from: '2024-09-10' });
    expect(reading.grain).toBe('month');
    expect(keys(reading.periods)).toEqual([
      ...['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    // Every section reads the clamped Span.
    expect(keys(sections.netCashFlow.data!.rows)).toEqual(keys(reading.periods));
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

describe('the reading', () => {
  it('opens on Rolling 12 months by month, its first month cut short and the last to date', async () => {
    fixToday('2025-03-20');

    const { reading, sections } = await settled(await loadAnalytics(t.ctx, DEFAULT_SPAN));
    const { periods } = reading;

    expect(reading).toMatchObject({
      span: presetSpan('rolling-12-months'),
      from: '2024-03-21',
      to: '2025-03-20',
      grain: 'month',
    });
    expect(keys(periods)).toEqual([
      ...['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'],
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'],
    ]);
    expect(periods[0]).toEqual({
      key: '2024-03',
      label: 'Mar 2024',
      isToDate: false,
      isPartial: true,
    });
    expect(periods.at(-1)).toEqual({
      key: '2025-03',
      label: 'Mar 2025',
      isToDate: true,
      isPartial: false,
    });
    expect(periods.slice(1, -1).every((p) => !p.isPartial && !p.isToDate)).toBe(true);
    // Every per-period card covers the Span at its grain, both ends set apart.
    const columns = sections.incomeVsExpense.data!.columns;
    const rows = sections.netCashFlow.data!.rows;
    expect(keys(columns)).toEqual(keys(periods));
    expect(keys(rows)).toEqual(keys(periods));
    for (const headers of [columns, rows, sections.spendingByCategory.data!.rows]) {
      expect(flags(headers)).toEqual([true, ...Array<boolean>(11).fill(false), true]);
    }
  });

  it('is split by quarter up to 24 months and by year beyond', async () => {
    fixToday('2025-03-20');

    const quarterly = (
      await settled(await loadAnalytics(t.ctx, presetSpan('this-year-and-last-1')))
    ).reading;
    const yearly = (await settled(await loadAnalytics(t.ctx, presetSpan('this-year-and-last-4'))))
      .reading;

    expect(quarterly).toMatchObject({ from: '2024-01-01', grain: 'quarter' });
    expect(keys(quarterly.periods)).toEqual([
      '2024-Q1',
      '2024-Q2',
      '2024-Q3',
      '2024-Q4',
      '2025-Q1',
    ]);
    expect(yearly).toMatchObject({ from: '2021-01-01', grain: 'year' });
    expect(keys(yearly.periods)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    // Both start on a period's first day: nothing is cut short, the last is to date.
    for (const { periods } of [quarterly, yearly]) {
      expect(periods.map((p) => [p.isPartial, p.isToDate])).toEqual([
        ...periods.slice(0, -1).map(() => [false, false]),
        [false, true],
      ]);
    }
  });

  it("counts only the Span's days in its first period, so its periods add up to its total", async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      // Before the Span: the same month, but not its days.
      { bookingDate: '2024-03-20', amountMinor: -90_000 },
      { bookingDate: '2024-03-21', amountMinor: -10_000 },
      { bookingDate: '2024-07-15', amountMinor: 50_000 },
      { bookingDate: '2025-03-20', amountMinor: 3_000 },
    ]);

    const { sections } = await settled(await loadAnalytics(t.ctx, DEFAULT_SPAN));
    const data = sections.netCashFlow.data!;

    expect(data.rowTotals[0]).toBe(-10_000);
    expect(data.total).toBe(43_000);
    expect(data.rowTotals.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(43_000);
    // The first period's Drill-down lists the Span's days of it only.
    const page = await openDrill(t.ctx, data.hrefs.rowTotals[0]);
    expect(page.span).toEqual({ from: '2024-03-21', to: '2024-03-31' });
    expect(page.value).toBe(-10_000);
    expect(page.transactions.map((row) => row.chfMinor)).toEqual([-10_000]);
  });
});

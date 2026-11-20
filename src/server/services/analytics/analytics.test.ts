import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { loadAnalytics, type AnalyticsSections, type AnalyticsView } from '.';

/** The page as a whole: the Period window every per-period section reads. */

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

describe('the Period window', () => {
  it('is the last 12 calendar months in Month, ending with the current one to date', async () => {
    fixToday('2025-03-20');

    const { view, window, sections } = await settled(loadAnalytics(t.ctx, 'month'));

    expect(view).toBe('month');
    expect(keys(window)).toEqual([
      '2024-04',
      '2024-05',
      '2024-06',
      '2024-07',
      '2024-08',
      '2024-09',
      '2024-10',
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
      '2025-03',
    ]);
    expect(window.at(-1)).toEqual({ key: '2025-03', label: 'Mar 2025', isToDate: true });
    expect(window.slice(0, -1).every((period) => !period.isToDate)).toBe(true);
    expect(keys(sections.incomeVsExpense.data!.columns)).toEqual(keys(window));
    expect(keys(sections.netCashFlow.data!.rows)).toEqual(keys(window));
  });

  it('is the last 8 calendar quarters in Quarter and the last 6 years in Year', async () => {
    fixToday('2025-03-20');

    const quarters = (await settled(loadAnalytics(t.ctx, 'quarter'))).window;
    const years = (await settled(loadAnalytics(t.ctx, 'year'))).window;

    expect(keys(quarters)).toEqual([
      '2023-Q2',
      '2023-Q3',
      '2023-Q4',
      '2024-Q1',
      '2024-Q2',
      '2024-Q3',
      '2024-Q4',
      '2025-Q1',
    ]);
    expect(quarters.at(-1)).toEqual({ key: '2025-Q1', label: 'Q1 2025', isToDate: true });
    expect(keys(years)).toEqual(['2020', '2021', '2022', '2023', '2024', '2025']);
    expect(years.map((period) => period.isToDate)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

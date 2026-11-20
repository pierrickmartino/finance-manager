import { describe, expect, it } from 'vitest';
import type { ChartSource } from './chart-data';
import { readHeadlineTrend, sparkline } from './net-worth-headline';

/** A monthly Net worth table: one total per month from `first` (YYYY-MM), the last running. */
function monthly(first: string, totals: number[]): ChartSource {
  const [year, month] = first.split('-').map(Number) as [number, number];
  const keys = totals.map((_, i) => {
    const date = new Date(Date.UTC(year, month - 1 + i, 1));
    return date.toISOString().slice(0, 7);
  });
  return {
    measure: 'sum',
    rows: keys.map((key, i) => ({ key, label: key, isPartial: i === keys.length - 1 })),
    columns: [{ key: 'current', label: 'Current', isPartial: false }],
    cells: totals.map((total) => [total]),
    rowTotals: totals,
    columnTotals: [totals.at(-1) ?? null],
    total: totals.at(-1) ?? null,
    hrefs: {
      cells: keys.map((key) => [`accounts:${key}:current`]),
      rowTotals: keys.map((key) => `accounts:${key}`),
      columnTotals: ['accounts:latest:current'],
      total: 'accounts:latest',
    },
    drill: null,
  };
}

/** 25 month-ends, Nov 2024 to the running Nov 2026: 100k growing by 1k a month. */
const twoYears = monthly(
  '2024-11',
  Array.from({ length: 25 }, (_, i) => 100_000_00 + i * 1_000_00),
);

describe("the headline's Net worth trend", () => {
  it('draws every point, from 24 months before the latest to the latest', () => {
    const trend = readHeadlineTrend(twoYears);

    expect(trend.points).toHaveLength(25);
    expect(trend.points[0]).toEqual({
      label: '2024-11',
      value: 100_000_00,
      href: 'accounts:2024-11',
      isPartial: false,
    });
    expect(trend.points.at(-1)).toMatchObject({ label: '2026-11', value: 124_000_00 });
  });

  it('changes over 1M, 1Y and 2Y: since the point 1, 12 and 24 months before the latest', () => {
    expect(readHeadlineTrend(twoYears).changes).toEqual([
      { label: '1M', months: 1, since: '2026-10', change: 1_000_00, href: 'accounts:2026-10' },
      { label: '1Y', months: 12, since: '2025-11', change: 12_000_00, href: 'accounts:2025-11' },
      { label: '2Y', months: 24, since: '2024-11', change: 24_000_00, href: 'accounts:2024-11' },
    ]);
  });

  it('changes since the end of the previous quarter or year when its points are quarters or years', () => {
    const quarters: ChartSource = {
      ...monthly('2024-01', [100_00, 200_00, 300_00, 400_00, 500_00, 650_00]),
      rows: ['2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'].map((key) => ({
        key,
        label: key,
        isPartial: key === '2026-Q3',
      })),
    };
    const years: ChartSource = {
      ...monthly('2024-01', [100_00, 300_00, 350_00]),
      rows: ['2024', '2025', '2026'].map((key) => ({ key, label: key, isPartial: key === '2026' })),
    };

    expect(readHeadlineTrend(quarters, 'quarter').changes).toEqual([
      { label: '1Q', months: 3, since: '2026-Q2', change: 150_00, href: 'accounts:2024-05' },
      { label: '1Y', months: 12, since: '2025-Q3', change: 450_00, href: 'accounts:2024-02' },
    ]);
    expect(readHeadlineTrend(years, 'year').changes).toEqual([
      { label: '1Y', months: 12, since: '2025', change: 50_00, href: 'accounts:2024-02' },
      { label: '2Y', months: 24, since: '2024', change: 250_00, href: 'accounts:2024-01' },
    ]);
  });

  it('says a fall as a negative change', () => {
    const falling = monthly('2026-09', [50_000_00, 48_000_00, 45_500_00]);

    expect(readHeadlineTrend(falling).changes).toEqual([
      { label: '1M', months: 1, since: '2026-10', change: -2_500_00, href: 'accounts:2026-10' },
    ]);
  });

  it('leaves out a change reaching further back than its points', () => {
    const fourteen = monthly(
      '2025-10',
      Array.from({ length: 14 }, (_, i) => 10_000_00 + i * 100_00),
    );

    expect(readHeadlineTrend(fourteen).changes.map((change) => change.label)).toEqual(['1M', '1Y']);
  });

  it('starts at the first month with any Net worth: the months before it have no data', () => {
    const recent = monthly('2024-11', [
      ...Array.from({ length: 20 }, () => 0),
      5_00,
      0,
      7_00,
      8_00,
      9_00,
    ]);

    const trend = readHeadlineTrend(recent);

    expect(trend.points.map((point) => point.value)).toEqual([5_00, 0, 7_00, 8_00, 9_00]);
    expect(trend.changes.map((change) => change.label)).toEqual(['1M']);
  });

  it('is empty without a month of Net worth', () => {
    expect(readHeadlineTrend(monthly('2026-11', []))).toEqual({ points: [], changes: [] });
    expect(readHeadlineTrend(monthly('2026-10', [0, 0]))).toEqual({ points: [], changes: [] });
  });
});

describe('sparkline', () => {
  it('fits the line between its own low and high, the area closed down to the bottom', () => {
    expect(sparkline([100, 300, 200])).toEqual({
      line: 'M0,90 L50,10 L100,50',
      area: 'M0,90 L50,10 L100,50 L100,100 L0,100 Z',
      spots: [
        { x: 0, y: 90 },
        { x: 50, y: 10 },
        { x: 100, y: 50 },
      ],
    });
  });

  it('draws a flat line across the middle', () => {
    expect(sparkline([7, 7])?.line).toBe('M0,50 L100,50');
  });

  it('draws nothing for fewer than two points', () => {
    expect(sparkline([7])).toBeNull();
    expect(sparkline([])).toBeNull();
  });
});

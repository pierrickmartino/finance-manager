import { describe, expect, it } from 'vitest';
import type { CardWidget, MonthFlow } from './card';
import type { ChartSource } from './chart-data';
import {
  flowSummary,
  headlineAmount,
  type HeadlineTrend,
  litTicks,
  spendingBars,
  spendingInsight,
} from './overview';

/** A one-column source whose total opens `total`. */
function totalled(rows: string[], values: number[]): ChartSource {
  const total = values.reduce((a, v) => a + v, 0);
  return {
    measure: 'sum',
    rows: rows.map((label) => ({ key: label, label, isPartial: false })),
    columns: [{ key: 'v', label: 'Value', isPartial: false }],
    cells: values.map((value) => [value]),
    rowTotals: values,
    columnTotals: [total],
    total,
    hrefs: {
      cells: rows.map((r) => [`cell:${r}`]),
      rowTotals: rows.map((r) => `row:${r}`),
      columnTotals: ['column:v'],
      total: 'total',
    },
    drill: null,
  };
}

const widget = (overrides: Partial<CardWidget> & Pick<CardWidget, 'data'>): CardWidget => ({
  id: 'w1',
  name: 'Widget',
  source: 'query',
  visualisation: 'stacked_bar',
  query: { rows: null },
  ...overrides,
});

const month = (label: string, income: number, expense: number, isPartial = false): MonthFlow => ({
  label,
  isPartial,
  income,
  expense,
  net: income - expense,
});

describe('headlineAmount', () => {
  const spending = widget({ name: 'Spending', data: totalled(['Jan', 'Feb'], [-500_00, -300_00]) });
  const balances = widget({
    name: 'Account balances in CHF',
    source: 'account_balances',
    visualisation: 'table',
    data: totalled(['UBS · Savings', 'UBS · Current'], [6000_00, 4000_00]),
  });

  it('leads with net worth from the Account balances', () => {
    expect(headlineAmount([spending, balances])).toEqual({
      label: 'Your net worth today',
      value: 10000_00,
      href: 'total',
      trend: null,
    });
  });

  const overTime = widget({
    name: 'Net worth',
    source: 'account_balances',
    visualisation: 'line',
    query: { rows: 'month' },
    data: totalled(['2025-01', '2025-02'], [9000_00, 9500_00]),
  });

  it('never reads Net worth over time as net worth today', () => {
    expect(headlineAmount([overTime, balances])).toMatchObject({
      label: 'Your net worth today',
      value: 10000_00,
    });
  });

  it('never leads with Net worth over time, nor takes its name', () => {
    expect(headlineAmount([overTime, spending])).toEqual({
      label: 'Spending',
      value: -800_00,
      href: 'total',
      trend: null,
    });
    expect(headlineAmount([overTime])).toBeNull();
  });

  const trend: HeadlineTrend = {
    points: [
      { label: 'Jan 2025', value: 9000_00, href: 'accounts:2025-01', isPartial: false },
      { label: 'Feb 2025', value: 10250_00, href: 'accounts:2025-02', isPartial: true },
    ],
    markers: [{ at: 0.5, date: '2025-01-20', title: 'Notary', href: '/transactions/t1' }],
  };

  it('carries the Net worth trend under net worth today, valued at its latest point', () => {
    expect(headlineAmount([spending, balances], trend)).toEqual({
      label: 'Your net worth today',
      value: 10250_00,
      href: 'total',
      trend,
    });
  });

  it('leaves the trend out when the headline is not net worth', () => {
    expect(headlineAmount([spending], trend)?.trend).toBeNull();
  });

  it('keeps the balances total when the trend has no point', () => {
    expect(headlineAmount([balances], { points: [], markers: [] })).toMatchObject({
      value: 10000_00,
      trend: null,
    });
  });

  it('falls back to the first Widget with a total', () => {
    expect(headlineAmount([widget({ data: null }), spending])).toEqual({
      label: 'Spending',
      value: -800_00,
      href: 'total',
      trend: null,
    });
  });

  it('is null when no Widget has a total', () => {
    expect(headlineAmount([widget({ data: null })])).toBeNull();
  });
});

describe('spendingInsight', () => {
  it('says spending is easing when the latest full month spent less than the months before', () => {
    // Average of Jan and Feb: 750; Mar spent 300, 60% below. Kept: (3500 - 1800) / 3500.
    const insight = spendingInsight([
      month('Jan', 1000_00, 600_00),
      month('Feb', 1000_00, 900_00),
      month('Mar', 1500_00, 300_00),
    ]);

    expect(insight).toEqual({
      headline: 'Spending is easing.',
      detail: [
        'Mar came in ',
        '60% below',
        ' your monthly average, and you kept 49% of everything that came in.',
      ],
    });
  });

  it('says spending is running high when the latest full month spent more', () => {
    const insight = spendingInsight([month('Jan', 1000_00, 500_00), month('Feb', 1000_00, 750_00)]);

    expect(insight?.headline).toBe('Spending is running high.');
    expect(insight?.detail.join('')).toMatch(/^Feb came in 50% above your monthly average/);
    expect(insight?.detail[1]).toBe('50% above');
  });

  it('leaves the month still running out', () => {
    const insight = spendingInsight([
      month('Jan', 1000_00, 500_00),
      month('Feb', 1000_00, 400_00),
      month('Mar', 0, 50_00, true),
    ]);

    expect(insight?.detail.join('')).toMatch(/^Feb came in 20% below/);
  });

  it('is null with fewer than two full months to compare', () => {
    expect(spendingInsight([month('Jan', 1000_00, 500_00), month('Feb', 0, 0, true)])).toBeNull();
  });
});

describe('flowSummary', () => {
  it('totals what came in, went out and was kept over every month shown', () => {
    const summary = flowSummary([
      month('Jan', 1000_00, 600_00),
      month('Feb', 1000_00, 1200_00),
      month('Mar', 500_00, 100_00, true),
    ]);

    expect(summary).toMatchObject({ income: 2500_00, expense: 1900_00, kept: 600_00 });
    expect(summary.savingsRate).toBeCloseTo(0.24);
  });

  it('averages, and picks the best and leanest month, over full months only', () => {
    const summary = flowSummary([
      month('Jan', 1000_00, 600_00),
      month('Feb', 1000_00, 1200_00),
      month('Mar', 900_00, 0, true),
    ]);

    expect(summary.keptPerMonth).toBe(100_00);
    expect(summary.best?.label).toBe('Jan');
    expect(summary.leanest?.label).toBe('Feb');
  });

  it('has no savings rate without income', () => {
    expect(flowSummary([month('Jan', 0, 100_00), month('Feb', 0, 50_00)]).savingsRate).toBeNull();
  });

  it('has no best or leanest month with fewer than two full months', () => {
    const summary = flowSummary([month('Jan', 1000_00, 600_00), month('Feb', 0, 10_00, true)]);

    expect(summary.keptPerMonth).toBe(400_00);
    expect(summary.best).toBeNull();
    expect(summary.leanest).toBeNull();
  });

  it('has no monthly average without a full month', () => {
    expect(flowSummary([month('Jan', 100_00, 10_00, true)]).keptPerMonth).toBeNull();
  });
});

describe('litTicks', () => {
  it('lights ticks in proportion to the share, at least one for any share', () => {
    expect(litTicks(0.5, 12)).toBe(6);
    expect(litTicks(0.01, 12)).toBe(1);
    expect(litTicks(1, 12)).toBe(12);
  });

  it('lights none for nothing and never more than all', () => {
    expect(litTicks(0, 12)).toBe(0);
    expect(litTicks(1.4, 12)).toBe(12);
  });
});

describe('spendingBars', () => {
  it('draws each full month against the average of the ones before the latest', () => {
    const bars = spendingBars([
      month('Aug 2026', 5000, 2000),
      month('Sep 2026', 5000, 4000),
      month('Oct 2026', 5000, 1000),
      month('Nov 2026', 5000, 9000, true),
    ]);
    expect(bars).toEqual({
      bars: [
        { label: 'Aug 2026', expense: 2000, share: 0.5, isLatest: false },
        { label: 'Sep 2026', expense: 4000, share: 1, isLatest: false },
        { label: 'Oct 2026', expense: 1000, share: 0.25, isLatest: true },
      ],
      average: 3000,
      averageShare: 0.75,
    });
  });

  it('is null without two full months to compare', () => {
    expect(spendingBars([month('Oct 2026', 5000, 1000), month('Nov 2026', 0, 0, true)])).toBe(null);
  });

  it('draws nothing tall when nothing was spent', () => {
    const bars = spendingBars([month('Sep 2026', 5000, 0), month('Oct 2026', 5000, 0)]);
    expect(bars?.bars.map((bar) => bar.share)).toEqual([0, 0]);
    expect(bars?.averageShare).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { CardWidget, MonthFlow } from './card';
import type { ChartSource } from './chart-data';
import { headlineAmount, litTicks, runningTotals, spendingInsight } from './overview';

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
    });
  });

  it('falls back to the first Widget with a total', () => {
    expect(headlineAmount([widget({ data: null }), spending])).toEqual({
      label: 'Spending',
      value: -800_00,
      href: 'total',
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

describe('runningTotals', () => {
  it('adds each value to the ones before it', () => {
    expect(runningTotals([100, -40, 25])).toEqual([100, 60, 85]);
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

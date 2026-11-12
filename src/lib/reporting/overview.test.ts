import { describe, expect, it } from 'vitest';
import type { ReportHeader } from '@/server/services/reporting';
import type { ChartSource } from './chart-data';
import {
  findMonthFlows,
  latestFullIndex,
  litTicks,
  monthFlows,
  periodValues,
  runningTotals,
  spendingInsight,
  type MonthFlow,
} from './overview';
import type { StoryWidget } from './story';

const header = (label: string, isPartial = false): ReportHeader => ({
  key: label,
  label,
  isPartial,
});

/** A source from a grid of cells, totals computed; the last row partial when asked. */
function source(
  rows: string[],
  columns: string[],
  cells: (number | null)[][],
  { lastIsPartial = false } = {},
): ChartSource {
  const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const rowTotals = cells.map(sum);
  return {
    measure: 'sum',
    rows: rows.map((row, r) => header(row, lastIsPartial && r === rows.length - 1)),
    columns: columns.map((column) => header(column)),
    cells,
    rowTotals,
    columnTotals: columns.map((_, c) => sum(cells.map((row) => row[c] ?? null))),
    total: sum(rowTotals),
    hrefs: {
      cells: rows.map((r) => columns.map((c) => `cell:${r}/${c}`)),
      rowTotals: rows.map((r) => `row:${r}`),
      columnTotals: columns.map((c) => `column:${c}`),
      total: 'total',
    },
  };
}

const flowSource = source(
  ['Jan', 'Feb', 'Mar'],
  ['Expense', 'Income'],
  [
    [-600_00, 1000_00],
    [-900_00, 1000_00],
    [-300_00, 1500_00],
  ],
);

const month = (label: string, income: number, expense: number, isPartial = false): MonthFlow => ({
  label,
  isPartial,
  income,
  expense,
  net: income - expense,
});

describe('monthFlows', () => {
  it('reads what came in and went out per row, whichever column holds the income', () => {
    expect(monthFlows(flowSource)).toEqual([
      month('Jan', 1000_00, 600_00),
      month('Feb', 1000_00, 900_00),
      month('Mar', 1500_00, 300_00),
    ]);
  });

  it('is null unless the source has one income and one expense column', () => {
    const spending = source(['Jan'], ['Rent', 'Food'], [[-2000_00, -500_00]]);
    const single = source(['Jan'], ['Net'], [[400_00]]);

    expect(monthFlows(spending)).toBeNull();
    expect(monthFlows(single)).toBeNull();
  });

  it('counts an empty cell as nothing', () => {
    const gaps = source(
      ['Jan', 'Feb'],
      ['Income', 'Expense'],
      [
        [1000_00, null],
        [null, -200_00],
      ],
    );

    expect(monthFlows(gaps)).toEqual([month('Jan', 1000_00, 0), month('Feb', 0, 200_00)]);
  });
});

describe('findMonthFlows', () => {
  const widget = (id: string, data: ChartSource | null): StoryWidget => ({
    id,
    name: id,
    source: 'query',
    visualisation: 'stacked_bar',
    data,
  });

  it('takes the first Widget that holds income and expense', () => {
    const spending = widget('spending', source(['Jan'], ['Rent', 'Food'], [[-1_00, -2_00]]));

    const found = findMonthFlows([widget('empty', null), spending, widget('flow', flowSource)]);

    expect(found?.widgetId).toBe('flow');
    expect(found?.months).toHaveLength(3);
  });

  it('is null when no Widget holds income and expense', () => {
    expect(findMonthFlows([widget('empty', null)])).toBeNull();
  });
});

describe('spendingInsight', () => {
  it('says spending is easing when the latest full month spent less than the months before', () => {
    // Average of Jan and Feb: 750; Mar spent 300, 60% below. Kept: (3500 - 1800) / 3500.
    const insight = spendingInsight(monthFlows(flowSource)!);

    expect(insight).toEqual({
      headline: 'Spending is easing.',
      detail:
        'Mar came in 60% below your monthly average, and you kept 49% of everything that came in.',
    });
  });

  it('says spending is running high when the latest full month spent more', () => {
    const insight = spendingInsight([month('Jan', 1000_00, 500_00), month('Feb', 1000_00, 750_00)]);

    expect(insight?.headline).toBe('Spending is running high.');
    expect(insight?.detail).toMatch(/^Feb came in 50% above your monthly average/);
  });

  it('leaves the month still running out', () => {
    const insight = spendingInsight([
      month('Jan', 1000_00, 500_00),
      month('Feb', 1000_00, 400_00),
      month('Mar', 0, 50_00, true),
    ]);

    expect(insight?.detail).toMatch(/^Feb came in 20% below/);
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

describe('latestFullIndex', () => {
  it('is the last row that is not partial, or -1 when every row is', () => {
    expect(latestFullIndex([header('Jan'), header('Feb'), header('Mar', true)])).toBe(1);
    expect(latestFullIndex([header('Mar', true)])).toBe(-1);
  });
});

describe('periodValues', () => {
  it('gives each row its total, its link and whether it is still running', () => {
    const data = source(['Jan', 'Feb'], ['Net'], [[400_00], [-100_00]], { lastIsPartial: true });

    expect(periodValues(data)).toEqual([
      { label: 'Jan', value: 400_00, href: 'row:Jan', isPartial: false },
      { label: 'Feb', value: -100_00, href: 'row:Feb', isPartial: true },
    ]);
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

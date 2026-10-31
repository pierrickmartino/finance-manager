import { describe, expect, it } from 'vitest';
import type { ReportHeader } from '@/server/services/reporting';
import { toDonutSlices, toSeriesChart, toSingleNumber, type ChartSource } from './chart-data';

const header = (key: string | null, label: string): ReportHeader => ({
  key,
  label,
  isPartial: false,
});
const TOTAL = header(null, 'Total');

/** A source whose links name their cell, so the mapping of each link can be checked. */
function source(
  rows: ReportHeader[],
  columns: ReportHeader[],
  cells: (number | null)[][],
  rowTotals: (number | null)[],
  columnTotals: (number | null)[],
  total: number | null,
): ChartSource {
  return {
    measure: 'sum',
    rows,
    columns,
    cells,
    rowTotals,
    columnTotals,
    total,
    hrefs: {
      cells: rows.map((r) => columns.map((c) => `cell:${r.label}/${c.label}`)),
      rowTotals: rows.map((r) => `row:${r.label}`),
      columnTotals: columns.map((c) => `column:${c.label}`),
      total: 'total',
    },
  };
}

describe('toSeriesChart (line and stacked bar)', () => {
  it('puts rows on the x axis and one series per column, each with its drill-down', () => {
    const data = source(
      [header('2025-01', 'Jan 2025'), header('2025-02', 'Feb 2025')],
      [header('income', 'Income'), header('expense', 'Expense')],
      [
        [500_000, -20_000],
        [null, -8_000],
      ],
      [480_000, -8_000],
      [500_000, -28_000],
      472_000,
    );

    expect(toSeriesChart(data)).toEqual({
      series: [
        { key: 's0', label: 'Income', slot: 0 },
        { key: 's1', label: 'Expense', slot: 1 },
      ],
      points: [
        {
          label: 'Jan 2025',
          values: { s0: 500_000, s1: -20_000 },
          hrefs: { s0: 'cell:Jan 2025/Income', s1: 'cell:Jan 2025/Expense' },
        },
        {
          label: 'Feb 2025',
          values: { s0: null, s1: -8_000 },
          hrefs: { s0: 'cell:Feb 2025/Income', s1: 'cell:Feb 2025/Expense' },
        },
      ],
    });
  });

  it('shows a report without columns as one series named by the measure', () => {
    const data = source(
      [header('2025-01', 'Jan 2025')],
      [TOTAL],
      [[480_000]],
      [480_000],
      [480_000],
      480_000,
    );

    expect(toSeriesChart(data).series).toEqual([{ key: 's0', label: 'Total', slot: 0 }]);
  });

  it('folds columns past the eighth into "Other", which has no single drill-down', () => {
    const columns = Array.from({ length: 10 }, (_, i) => header(`c${i}`, `C${i}`));
    const values = columns.map((_, i) => (i === 9 ? null : -(i + 1) * 100));
    const data = source([header('2025-01', 'Jan')], columns, [values], [-3600], values, -3600);

    const chart = toSeriesChart(data);

    expect(chart.series.map((s) => s.label)).toEqual([
      'C0',
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
      'Other',
    ]);
    expect(chart.series[7]).toEqual({ key: 's7', label: 'Other', slot: 7 });
    expect(chart.points[0]!.values.s7).toBe(-800 - 900);
    expect(chart.points[0]!.hrefs.s7).toBeNull();
  });
});

describe('toDonutSlices', () => {
  it('slices the rows by their totals, sized by magnitude, keeping the signed value', () => {
    const data = source(
      [header('g', 'Groceries'), header('r', 'Restaurants'), header('x', 'Refunds')],
      [TOTAL],
      [[-20_000], [-8_000], [null]],
      [-20_000, -8_000, null],
      [-28_000],
      -28_000,
    );

    expect(toDonutSlices(data)).toEqual([
      { label: 'Groceries', value: 20_000, signedValue: -20_000, href: 'row:Groceries', slot: 0 },
      {
        label: 'Restaurants',
        value: 8_000,
        signedValue: -8_000,
        href: 'row:Restaurants',
        slot: 1,
      },
    ]);
  });

  it('slices the columns when the report has a single row', () => {
    const data = source(
      [TOTAL],
      [header('g', 'Groceries'), header('r', 'Restaurants')],
      [[-20_000, -8_000]],
      [-28_000],
      [-20_000, -8_000],
      -28_000,
    );

    expect(toDonutSlices(data).map((slice) => [slice.label, slice.href])).toEqual([
      ['Groceries', 'column:Groceries'],
      ['Restaurants', 'column:Restaurants'],
    ]);
  });

  it('keeps the seven largest slices in order and folds the rest into "Other"', () => {
    const rows = Array.from({ length: 9 }, (_, i) => header(`k${i}`, `K${i}`));
    // K0 and K4 are the smallest.
    const totals = [-1, -50, -60, -70, -2, -80, -90, -100, -110];
    const data = source(
      rows,
      [TOTAL],
      totals.map((v) => [v]),
      totals,
      [-563],
      -563,
    );

    const slices = toDonutSlices(data);

    expect(slices.map((slice) => slice.label)).toEqual([
      'K1',
      'K2',
      'K3',
      'K5',
      'K6',
      'K7',
      'K8',
      'Other',
    ]);
    expect(slices[7]).toEqual({ label: 'Other', value: 3, signedValue: -3, href: null, slot: 7 });
  });
});

describe('toSingleNumber', () => {
  it('shows the grand total and drills down to every Transaction behind it', () => {
    const data = source([TOTAL], [TOTAL], [[-28_000]], [-28_000], [-28_000], -28_000);

    expect(toSingleNumber(data)).toEqual({ value: -28_000, href: 'total' });
  });
});

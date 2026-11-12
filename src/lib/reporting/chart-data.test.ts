import { describe, expect, it } from 'vitest';
import type { CellRef, ReportAxis, ReportHeader } from '@/server/services/reporting';
import { toDonutSlices, toSeriesChart, toSingleNumber, type ChartSource } from './chart-data';
import { cellFromParams, DEFAULT_WIDGET_QUERY } from './widget-params';

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
    drill: null,
  };
}

/** The same source, its Drill-downs those of a query with these axes, opened from the editor. */
function drillable(
  data: ChartSource,
  rows: ReportAxis | null,
  columns: ReportAxis | null,
): ChartSource {
  return {
    ...data,
    drill: { query: { ...DEFAULT_WIDGET_QUERY, rows, columns }, origin: { kind: 'editor' } },
  };
}

/** The cell a Drill-down link opens. */
function cellOf(href: string | null | undefined): CellRef {
  const params = new URL(href!, 'http://localhost').searchParams;
  const grouped: Record<string, string | string[]> = {};
  for (const name of new Set(params.keys())) {
    const values = params.getAll(name);
    grouped[name] = name.endsWith('Not') ? values : values[0]!;
  }
  return cellFromParams(grouped);
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
      totalHrefs: { s0: 'column:Income', s1: 'column:Expense' },
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

  it('folds columns past the eighth into "Other", which drills down to every column but the kept ones', () => {
    const columns = Array.from({ length: 10 }, (_, i) => header(`c${i}`, `C${i}`));
    const values = columns.map((_, i) => (i === 9 ? null : -(i + 1) * 100));
    const data = drillable(
      source([header('2025-01', 'Jan')], columns, [values], [-3600], values, -3600),
      'month',
      'category',
    );

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
    expect(cellOf(chart.points[0]!.hrefs.s7)).toEqual({
      row: '2025-01',
      column: { except: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
      page: 1,
    });
    // Over the whole range, as a ranking reads it.
    expect(cellOf(chart.totalHrefs.s7)).toEqual({
      column: { except: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
      page: 1,
    });
    expect(chart.totalHrefs.s0).toBe('column:C0');
  });

  it('leaves "Other" without a link where its Drill-down could not add up to it', () => {
    const columns = Array.from({ length: 9 }, (_, i) => header(`t${i}`, `T${i}`));
    const values = columns.map(() => -100);
    const table = source([header('2025-01', 'Jan')], columns, [values], [-900], values, -900);

    // A Transaction with two folded Tags counts in "Other" twice; Account balances aren't
    // Transactions at all.
    expect(toSeriesChart(drillable(table, 'month', 'tag')).points[0]!.hrefs.s7).toBeNull();
    expect(toSeriesChart(table).points[0]!.hrefs.s7).toBeNull();
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
    const data = drillable(
      source(
        rows,
        [TOTAL],
        totals.map((v) => [v]),
        totals,
        [-563],
        -563,
      ),
      'category',
      null,
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
    expect(slices[7]).toMatchObject({ label: 'Other', value: 3, signedValue: -3, slot: 7 });
    expect(cellOf(slices[7]!.href)).toEqual({
      row: { except: ['k1', 'k2', 'k3', 'k5', 'k6', 'k7', 'k8'] },
      page: 1,
    });
  });

  it('folds the columns of a single-row report into "Other" by the columns', () => {
    const columns = Array.from({ length: 9 }, (_, i) => header(`k${i}`, `K${i}`));
    const totals = [-1, -50, -60, -70, -2, -80, -90, -100, -110];
    const data = drillable(source([TOTAL], columns, [totals], [-563], totals, -563), null, 'payee');

    expect(cellOf(toDonutSlices(data)[7]!.href)).toEqual({
      column: { except: ['k1', 'k2', 'k3', 'k5', 'k6', 'k7', 'k8'] },
      page: 1,
    });
  });
});

describe('toSingleNumber', () => {
  it('shows the grand total and drills down to every Transaction behind it', () => {
    const data = source([TOTAL], [TOTAL], [[-28_000]], [-28_000], [-28_000], -28_000);

    expect(toSingleNumber(data)).toEqual({ value: -28_000, href: 'total' });
  });
});

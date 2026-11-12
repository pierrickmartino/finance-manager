import { describe, expect, it } from 'vitest';
import type { ReportHeader } from '@/server/services/reporting';
import type { ChartSource } from './chart-data';
import { compactValue, HEAT_LEVELS, heatLevel, toHeatmap } from './heatmap';

const header = (label: string, isPartial = false): ReportHeader => ({
  key: label,
  label,
  isPartial,
});

function source(
  rows: string[],
  columns: ReportHeader[],
  cells: (number | null)[][],
  measure: ChartSource['measure'] = 'sum',
): ChartSource {
  const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0);
  return {
    measure,
    rows: rows.map((row) => header(row)),
    columns,
    cells,
    rowTotals: cells.map(sum),
    columnTotals: columns.map((_, c) => sum(cells.map((row) => row[c] ?? null))),
    total: sum(cells.map(sum)),
    hrefs: {
      cells: rows.map((r) => columns.map((c) => `cell:${r}/${c.label}`)),
      rowTotals: rows.map((r) => `row:${r}`),
      columnTotals: columns.map((c) => `column:${c.label}`),
      total: 'total',
    },
  };
}

const months = [header('Sep 2026'), header('Oct 2026'), header('Nov 2026', true)];

const spending = source(['Groceries', 'Rent', 'Holidays'], months, [
  [-600_00, -700_00, -300_00],
  [-2150_00, -2150_00, -2150_00],
  [null, -1400_00, null],
]);

describe('toHeatmap', () => {
  it('ranks the rows by the size of their total, largest first', () => {
    const map = toHeatmap(spending);

    expect(map.rows.map((row) => row.label)).toEqual(['Rent', 'Groceries', 'Holidays']);
    expect(map.rows[0]).toMatchObject({ key: 'Rent', total: -6450_00, totalHref: 'row:Rent' });
  });

  it('shortens month labels and marks the partial period', () => {
    expect(toHeatmap(spending).columns).toEqual([
      { label: 'Sep', fullLabel: 'Sep 2026', isPartial: false },
      { label: 'Oct', fullLabel: 'Oct 2026', isPartial: false },
      { label: 'Nov', fullLabel: 'Nov 2026 (partial)', isPartial: true },
    ]);
  });

  it('keeps labels that are not months as they are', () => {
    const map = toHeatmap(source(['Cash'], [header('Total')], [[100_00]]));

    expect(map.columns[0]).toMatchObject({ label: 'Total', fullLabel: 'Total' });
  });

  it('shades each cell by its size against the largest cell, leaving gaps empty', () => {
    const [rent, groceries, holidays] = toHeatmap(spending).rows;

    expect(rent!.cells.map((cell) => cell?.level)).toEqual([5, 5, 5]);
    expect(groceries!.cells[0]).toMatchObject({ value: -600_00, href: 'cell:Groceries/Sep 2026' });
    expect(groceries!.cells[0]!.level).toBe(heatLevel(600 / 2150));
    expect(holidays!.cells[0]).toBeNull();
  });

  it('shows a total column only when there is more than one column', () => {
    expect(toHeatmap(spending).hasTotal).toBe(true);
    expect(toHeatmap(source(['Cash'], [header('Total')], [[100_00]])).hasTotal).toBe(false);
  });

  it('drops the sign from the cells when every value shares one, and keeps it otherwise', () => {
    expect(toHeatmap(spending).isSigned).toBe(false);
    const flow = source(['Jan'], [header('In'), header('Out')], [[1000_00, -600_00]]);
    expect(toHeatmap(flow).isSigned).toBe(true);
  });

  it('does not divide by zero when every value is zero', () => {
    const zeros = toHeatmap(source(['A'], [header('X')], [[0]]));

    expect(zeros.rows[0]!.cells[0]!.level).toBe(0);
  });
});

describe('heatLevel', () => {
  it('splits sizes into the heat levels, the largest on the darkest', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(0.1)).toBe(0);
    expect(heatLevel(0.5)).toBe(2);
    expect(heatLevel(0.99)).toBe(HEAT_LEVELS.length - 1);
    expect(heatLevel(1)).toBe(HEAT_LEVELS.length - 1);
  });

  it('puts light text only on the darkest levels', () => {
    expect(HEAT_LEVELS.map((level) => level.isDark)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('compactValue', () => {
  it('writes francs in thousands from 1000, rounded to one decimal', () => {
    expect(compactValue(2150_00, 'sum', false)).toBe('2.2k');
    expect(compactValue(612_40, 'sum', false)).toBe('612');
  });

  it('drops the sign unless asked to keep it', () => {
    expect(compactValue(-2150_00, 'sum', false)).toBe('2.2k');
    expect(compactValue(-2150_00, 'sum', true)).toBe('−2.2k');
  });

  it('counts Transactions, not minor units', () => {
    expect(compactValue(42, 'count', false)).toBe('42');
    expect(compactValue(1500, 'count', false)).toBe('1.5k');
  });
});

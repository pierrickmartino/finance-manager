import { describe, expect, it } from 'vitest';
import type { ReportHeader } from '@/server/services/reporting';
import type { ChartSource } from './chart-data';
import { RING_TONES, ringArcPath, ringSlices } from './ring';

const header = (label: string): ReportHeader => ({ key: label, label, isPartial: false });

/** One part per row; the values are the row totals. */
function parts(entries: [string, number][]): ChartSource {
  const values = entries.map(([, value]) => value);
  return {
    measure: 'sum',
    rows: entries.map(([label]) => header(label)),
    columns: [],
    cells: values.map((value) => [value]),
    rowTotals: values,
    columnTotals: [],
    total: values.reduce((a, b) => a + b, 0),
    hrefs: {
      cells: entries.map(([label]) => [`cell:${label}`]),
      rowTotals: entries.map(([label]) => `row:${label}`),
      columnTotals: [],
      total: 'total',
    },
  };
}

const TURN = Math.PI * 2;

describe('ringSlices', () => {
  it('orders the parts largest first, each a tone darker than the next', () => {
    const slices = ringSlices(
      parts([
        ['Transport', 200],
        ['Housing', 600],
        ['Groceries', 200],
      ]),
    );

    expect(slices.map(({ label, share, tone }) => [label, share, tone])).toEqual([
      ['Housing', 0.6, 0],
      ['Transport', 0.2, 1],
      ['Groceries', 0.2, 2],
    ]);
    expect(slices[0]).toMatchObject({ value: 600, href: 'row:Housing', isOther: false });
  });

  it('runs clockwise from the top, the slices meeting end to start around one full turn', () => {
    const slices = ringSlices(
      parts([
        ['Housing', 500],
        ['Groceries', 300],
        ['Transport', 200],
      ]),
    );

    expect(slices[0]!.start).toBe(0);
    expect(slices[1]!.start).toBeCloseTo(slices[0]!.end);
    expect(slices[2]!.start).toBeCloseTo(slices[1]!.end);
    expect(slices[2]!.end).toBeCloseTo(TURN);
    expect(slices[0]!.end).toBeCloseTo(0.5 * TURN);
  });

  it('sizes a negative part by its magnitude and keeps its sign', () => {
    const slices = ringSlices(
      parts([
        ['Housing', 600],
        ['Refunds', -200],
        ['Groceries', 200],
      ]),
    );

    expect(slices.map(({ label, value, share }) => [label, value, share])).toEqual([
      ['Housing', 600, 0.6],
      ['Refunds', -200, 0.2],
      ['Groceries', 200, 0.2],
    ]);
  });

  it('marks only the parts whose sign goes against the whole', () => {
    const expenses = ringSlices(
      parts([
        ['Housing', -600],
        ['Refunds', 100],
        ['Groceries', -200],
      ]),
    );

    expect(expenses.map(({ label, isCounter }) => [label, isCounter])).toEqual([
      ['Housing', false],
      ['Groceries', false],
      ['Refunds', true],
    ]);
  });

  it('puts "Other" last, whatever its size, and gives it no tone of the ramp', () => {
    const entries: [string, number][] = [
      ['A', 100],
      ['B', 90],
      ['C', 80],
      ['D', 70],
      ['E', 60],
      ['F', 50],
      ['G', 40],
      ['H', 300],
      ['I', 300],
    ];

    const slices = ringSlices(parts(entries));

    expect(slices).toHaveLength(8);
    const last = slices.at(-1)!;
    expect(last).toMatchObject({ label: 'Other', isOther: true, href: null });
    expect(slices.slice(0, -1).every((slice) => !slice.isOther)).toBe(true);
    expect(slices.slice(0, -1).map((slice) => slice.tone)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(Math.max(...slices.map((slice) => slice.tone))).toBeLessThan(RING_TONES);
  });

  it('is empty when every part is zero', () => {
    expect(ringSlices(parts([['Housing', 0]]))).toEqual([]);
  });
});

describe('ringArcPath', () => {
  const ring = { size: 160, outer: 78, inner: 52 };

  it('draws a quarter turn from the top as an outer arc, then back along the inner one', () => {
    expect(ringArcPath(0, TURN / 4, ring)).toBe(
      'M80.00,2.00 A78,78 0 0 1 158.00,80.00 L132.00,80.00 A52,52 0 0 0 80.00,28.00 Z',
    );
  });

  it('flags arcs over half a turn as large', () => {
    expect(ringArcPath(0, TURN * 0.75, ring)).toContain('A78,78 0 1 1');
  });

  it('prints fixed decimals, so the server and the browser draw the same path', () => {
    const path = ringArcPath(0.1, 1.3, ring);

    for (const number of path.match(/\d+\.\d+/g) ?? []) {
      expect(number.split('.')[1]).toHaveLength(2);
    }
  });
});

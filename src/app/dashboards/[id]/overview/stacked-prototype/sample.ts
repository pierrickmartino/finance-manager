/*
 * PROTOTYPE — throwaway. Made-up stacked-bar tables so every variant can be judged without real
 * data: `categories` (5 expense Categories), `many` (11, to see the fold), `flows` (income vs
 * expense, mixed signs). Amounts in minor units; expenses negative, as the engine returns them.
 */

import type { ChartSource } from '@/lib/reporting/chart-data';

export type SampleMode = 'categories' | 'many' | 'flows' | 'real';
export const SAMPLE_MODES: SampleMode[] = ['categories', 'many', 'flows', 'real'];

const MONTHS = [
  'Dec 2025',
  'Jan 2026',
  'Feb 2026',
  'Mar 2026',
  'Apr 2026',
  'May 2026',
  'Jun 2026',
  'Jul 2026',
  'Aug 2026',
  'Sep 2026',
  'Oct 2026',
  'Nov 2026',
];

/** Deterministic wobble so the bars aren't flat. */
const wobble = (seed: number, i: number): number => 0.75 + 0.5 * Math.abs(Math.sin(seed * 7.3 + i));

function table(columns: { label: string; base: number }[]): ChartSource {
  const cells = MONTHS.map((_, r) =>
    columns.map((column, c) => {
      const partial = r === MONTHS.length - 1 ? 0.4 : 1;
      return Math.round(column.base * wobble(c + 1, r) * partial) * 100;
    }),
  );
  const rowTotals = cells.map((row) => row.reduce((t, v) => t + v, 0));
  const columnTotals = columns.map((_, c) => cells.reduce((t, row) => t + row[c]!, 0));
  return {
    measure: 'sum',
    rows: MONTHS.map((label, r) => ({
      key: `m${r}`,
      label,
      isPartial: r === MONTHS.length - 1,
    })),
    columns: columns.map((column, c) => ({ key: `c${c}`, label: column.label, isPartial: false })),
    cells,
    rowTotals,
    columnTotals,
    total: rowTotals.reduce((t, v) => t + v, 0),
    hrefs: {
      cells: cells.map((row) => row.map(() => '/transactions')),
      rowTotals: cells.map(() => '/transactions'),
      columnTotals: columns.map(() => '/transactions'),
      total: '/transactions',
    },
  };
}

export function sampleData(mode: Exclude<SampleMode, 'real'>): ChartSource {
  if (mode === 'flows')
    return table([
      { label: 'Income', base: 7200 },
      { label: 'Expense', base: -5400 },
    ]);
  if (mode === 'many')
    return table(
      [
        ['Rent', 2100],
        ['Groceries', 780],
        ['Restaurants', 340],
        ['Transport', 290],
        ['Insurance', 410],
        ['Utilities', 180],
        ['Leisure', 220],
        ['Clothing', 140],
        ['Health', 160],
        ['Gifts', 90],
        ['Subscriptions', 70],
      ].map(([label, base]) => ({ label: label as string, base: -(base as number) })),
    );
  return table(
    [
      ['Rent', 2100],
      ['Groceries', 780],
      ['Insurance', 410],
      ['Restaurants', 340],
      ['Transport', 290],
    ].map(([label, base]) => ({ label: label as string, base: -(base as number) })),
  );
}

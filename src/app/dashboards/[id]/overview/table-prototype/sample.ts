/*
 * PROTOTYPE — throwaway. Made-up "table" Widgets so every variant can be judged on a realistic
 * pivot without seeding the database: a wide one (Categories × months) and a narrow one (one
 * column). Appended to the board below the real Widgets while ?sample=on.
 */

import type { ChartSource } from '@/lib/reporting/chart-data';
import type { ReportHeader } from '@/server/services/reporting';
import type { BoardChapter } from '../widget-board';

const HREF = '/transactions';

function header(key: string, label: string, isPartial = false): ReportHeader {
  return { key, label, isPartial };
}

function sum(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

function source(rows: ReportHeader[], columns: ReportHeader[], cells: (number | null)[][]) {
  const rowTotals = cells.map(sum);
  const columnTotals = columns.map((_, c) => sum(cells.map((row) => row[c] ?? null)));
  const data: ChartSource = {
    measure: 'sum',
    rows,
    columns,
    cells,
    rowTotals,
    columnTotals,
    total: sum(rowTotals),
    hrefs: {
      cells: cells.map((row) => row.map(() => HREF)),
      rowTotals: rows.map(() => HREF),
      columnTotals: columns.map(() => HREF),
      total: HREF,
    },
  };
  return data;
}

const MONTHS = [
  header('2026-06', 'Jun 2026'),
  header('2026-07', 'Jul 2026'),
  header('2026-08', 'Aug 2026'),
  header('2026-09', 'Sep 2026'),
  header('2026-10', 'Oct 2026'),
  header('2026-11', 'Nov 2026', true),
];

// CHF minor units, expenses negative.
const CATEGORY_ROWS: [string, (number | null)[]][] = [
  ['Rent', [-215000, -215000, -215000, -215000, -215000, -215000]],
  ['Groceries', [-61240, -58410, -72990, -64320, -69850, -28730]],
  ['Health insurance', [-41200, -41200, -41200, -41200, -41200, null]],
  ['Restaurants', [-18900, -33450, -41280, -12700, -22610, -8400]],
  ['Transport', [-14800, -9200, -31500, -14800, -16350, -7400]],
  ['Holidays', [null, -142000, -86500, null, null, null]],
  ['Subscriptions', [-6490, -6490, -6490, -7290, -7290, -7290]],
  ['Unclassified', [-3200, null, -11800, -2450, -9900, -1200]],
];

const ACCOUNT_ROWS: [string, number][] = [
  ['UBS Private', 1284500],
  ['Revolut CHF', 214080],
  ['Savings 3a', 4120000],
  ['Revolut EUR', 98640],
  ['Cash', 32000],
];

export function sampleChapters(): BoardChapter[] {
  const byCategory = source(
    CATEGORY_ROWS.map(([label], i) => header(`c${i}`, label)),
    MONTHS,
    CATEGORY_ROWS.map(([, values]) => values),
  );
  const byAccount = source(
    ACCOUNT_ROWS.map(([label], i) => header(`a${i}`, label)),
    [header('all', 'Total')],
    ACCOUNT_ROWS.map(([, value]) => [value]),
  );
  return [
    {
      id: 'prototype-sample-wide',
      name: 'Spending by Category (sample)',
      source: 'query',
      visualisation: 'table',
      data: byCategory,
      error: null,
      unconvertedCount: 0,
      layout: { x: 0, y: 1000, w: 8, h: 11 },
    },
    {
      id: 'prototype-sample-narrow',
      name: 'Balance by Account (sample)',
      source: 'query',
      visualisation: 'table',
      data: byAccount,
      error: null,
      unconvertedCount: 0,
      layout: { x: 8, y: 1000, w: 4, h: 11 },
    },
  ];
}

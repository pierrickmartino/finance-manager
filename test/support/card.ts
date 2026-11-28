import type { ReportAxis, ReportHeader } from '@/server/services/reporting';
import { readCard, type CardWidget, type MonthFlow } from '@/lib/reporting/card';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { cellFromParams, DEFAULT_WIDGET_QUERY } from '@/lib/reporting/widget-params';

/** Fixtures for the `readCard` tests: sources, Widgets and plain money. */

export const header = (label: string, isPartial = false): ReportHeader => ({
  key: label,
  label,
  isPartial,
});

/** A source from a grid of cells, totals computed, links naming what they point at. */
export function source(
  rows: string[],
  columns: string[],
  cells: (number | null)[][],
  { lastIsPartial = false } = {},
): ChartSource {
  const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const rowTotals = cells.map(sum);
  const columnTotals = columns.map((_, c) => sum(cells.map((row) => row[c] ?? null)));
  return {
    measure: 'sum',
    rows: rows.map((row, r) => header(row, lastIsPartial && r === rows.length - 1)),
    columns: columns.map((column) => header(column)),
    cells,
    rowTotals,
    columnTotals,
    total: sum(rowTotals),
    hrefs: {
      cells: rows.map((r) => columns.map((c) => `cell:${r}/${c}`)),
      rowTotals: rows.map((r) => `row:${r}`),
      columnTotals: columns.map((c) => `column:${c}`),
      total: 'total',
    },
    drill: null,
  };
}

/** The same source, its Drill-downs those of a query with these axes. */
export function drillable(data: ChartSource, rows: ReportAxis, columns: ReportAxis): ChartSource {
  return {
    ...data,
    drill: { query: { ...DEFAULT_WIDGET_QUERY, rows, columns }, origin: { kind: 'editor' } },
  };
}

/** The cell a Drill-down link opens, and the measure it opens it with. */
export function drillOf(href: string | null | undefined) {
  const params = new URL(href!, 'http://localhost').searchParams;
  const grouped: Record<string, string | string[]> = {};
  for (const name of new Set(params.keys())) {
    grouped[name] = name.endsWith('Not') ? params.getAll(name) : params.get(name)!;
  }
  return {
    cell: cellFromParams(grouped),
    measure: params.get('measure'),
    per: params.get('per'),
    origin: params.get('origin'),
  };
}

export function widget(overrides: Partial<CardWidget> & Pick<CardWidget, 'data'>): CardWidget {
  return {
    id: 'w1',
    name: 'Widget',
    source: 'query',
    visualisation: 'line',
    query: { rows: null },
    ...overrides,
  };
}

/** Plain money text so assertions read in francs (values are minor units). */
export const money = (minor: number) => `CHF ${minor / 100}`;

export const read = (card: CardWidget) => readCard(card, money);

export const month = (
  label: string,
  income: number,
  expense: number,
  isPartial = false,
): MonthFlow => ({
  label,
  isPartial,
  income,
  expense,
  net: income - expense,
});

export const incomeVsExpense = widget({
  id: 'flow',
  name: 'Income vs. expense',
  visualisation: 'stacked_bar',
  data: source(
    ['Jan', 'Feb', 'Mar'],
    ['Income', 'Expense'],
    [
      [1000_00, -600_00],
      [1000_00, -900_00],
      [1500_00, -700_00],
    ],
  ),
});

export const balances = widget({
  id: 'balances',
  name: 'Account balances in CHF',
  source: 'account_balances',
  visualisation: 'table',
  data: source(
    ['UBS · Savings', 'UBS · Current', 'BCGE · Pillar 3a'],
    ['Balance'],
    [[6000_00], [3000_00], [1000_00]],
  ),
});

export const spending = widget({
  id: 'spending',
  name: 'Spending by Category',
  visualisation: 'stacked_bar',
  data: source(
    ['Jan', 'Feb', 'Mar'],
    ['Home › Rent', 'Living › Groceries', 'Leisure › Travel'],
    [
      [-2000_00, -500_00, -100_00],
      [-2000_00, -400_00, -1000_00],
      [-2000_00, -400_00, 0],
    ],
  ),
});

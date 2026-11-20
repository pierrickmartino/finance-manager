import { describe, expect, it } from 'vitest';
import type { TimeAxis } from '@/server/services/reporting/query';
import type {
  ReportAxis,
  ReportHeader,
  Visualisation,
  WidgetSource,
} from '@/server/services/reporting';
import {
  cardFrame,
  latestFullIndex,
  readCard,
  STORY_SHOWN_AS,
  type CardWidget,
  type MonthFlow,
} from './card';
import type { ChartSource } from './chart-data';
import { cellFromParams, DEFAULT_WIDGET_QUERY } from './widget-params';

const header = (label: string, isPartial = false): ReportHeader => ({
  key: label,
  label,
  isPartial,
});

/** A source from a grid of cells, totals computed, links naming what they point at. */
function source(
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
function drillable(data: ChartSource, rows: ReportAxis, columns: ReportAxis): ChartSource {
  return {
    ...data,
    drill: { query: { ...DEFAULT_WIDGET_QUERY, rows, columns }, origin: { kind: 'editor' } },
  };
}

/** The cell a Drill-down link opens, and the measure it opens it with. */
function drillOf(href: string | null | undefined) {
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

function widget(overrides: Partial<CardWidget> & Pick<CardWidget, 'data'>): CardWidget {
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
const money = (minor: number) => `CHF ${minor / 100}`;

const read = (card: CardWidget) => readCard(card, money);

const month = (label: string, income: number, expense: number, isPartial = false): MonthFlow => ({
  label,
  isPartial,
  income,
  expense,
  net: income - expense,
});

const incomeVsExpense = widget({
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

const balances = widget({
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

const spending = widget({
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

/** Just what a card's frame is read from: its Widget and, once known, its series. */
const framed = (
  source: WidgetSource,
  visualisation: Visualisation,
  seriesCount = 1,
  timeAxis: TimeAxis | null = null,
) => ({
  source,
  visualisation,
  query: { rows: timeAxis },
  data: { columns: Array.from({ length: seriesCount }, (_, i) => header(`C${i}`)) },
});

describe('cardFrame', () => {
  it.each([
    ['a number Widget', framed('query', 'number', 3), 'number'],
    ['Account balances', framed('account_balances', 'table'), 'share'],
    ['Account balances by month', framed('account_balances', 'table', 1, 'month'), 'netWorthTrend'],
    ['Account balances by year', framed('account_balances', 'number', 1, 'year'), 'netWorthTrend'],
    ['a line by month', framed('query', 'line', 2, 'month'), 'trend'],
    ['a donut', framed('query', 'donut', 3), 'ring'],
    ['a table', framed('query', 'table', 6), 'grid'],
    ['a line', framed('query', 'line', 2), 'trend'],
    ['a stacked bar with two series', framed('query', 'stacked_bar', 2), 'bars'],
    ['a stacked bar with many series', framed('query', 'stacked_bar', 3), 'ranking'],
  ] as const)('frames %s as a %s card', (_name, input, expected) => {
    expect(cardFrame(input).kind).toBe(expected);
  });

  it('gives each kind its default and minimum size', () => {
    expect(cardFrame(framed('query', 'number')).sizes.initial).toEqual({ w: 4, h: 3 });
    expect(cardFrame(framed('account_balances', 'table')).sizes.initial).toEqual({ w: 4, h: 6 });
    expect(cardFrame(framed('query', 'donut')).sizes.initial).toEqual({ w: 4, h: 8 });
    expect(cardFrame(framed('query', 'stacked_bar', 5)).sizes.initial).toEqual({ w: 4, h: 8 });
    expect(cardFrame(framed('query', 'line')).sizes).toEqual({
      initial: { w: 8, h: 6 },
      min: { w: 4, h: 4 },
    });
    expect(cardFrame(framed('query', 'table', 6)).sizes).toEqual({
      initial: { w: 8, h: 8 },
      min: { w: 4, h: 5 },
    });
  });

  it('gives Net worth over time room for its facts under the chart', () => {
    expect(cardFrame(framed('account_balances', 'line', 1, 'month')).sizes).toEqual({
      initial: { w: 8, h: 9 },
      min: { w: 4, h: 9 },
    });
  });

  it('keeps every minimum at or below its default, and within three across', () => {
    const all = (['table', 'line', 'stacked_bar', 'donut', 'number'] as const).flatMap((v) => [
      framed('query', v, 1),
      framed('query', v, 5),
      framed('account_balances', v),
    ]);
    for (const { sizes } of all.map(cardFrame)) {
      expect(sizes.min.w).toBeLessThanOrEqual(sizes.initial.w);
      expect(sizes.min.h).toBeLessThanOrEqual(sizes.initial.h);
      expect(sizes.min.w).toBeLessThanOrEqual(4);
    }
  });

  it('hints at the mark the card will draw before its query has run', () => {
    const before = (source: WidgetSource, visualisation: Visualisation) =>
      cardFrame({ source, visualisation, query: { rows: null }, data: null }).placeholder;

    expect(before('query', 'number')).toBe('number');
    expect(before('account_balances', 'table')).toBe('ticks');
    expect(before('query', 'donut')).toBe('ring');
    expect(before('query', 'table')).toBe('grid');
    expect(before('query', 'line')).toBe('bars');
    expect(before('query', 'stacked_bar')).toBe('bars');
  });
});

describe('readCard: income vs. expense', () => {
  it('tells it by its biggest months in and out, not by the net', () => {
    const reading = read(incomeVsExpense);

    expect(reading.lead).toEqual({
      headline: 'Most came in: Mar',
      detail: 'CHF 1500',
      href: 'cell:Mar/Income',
    });
    expect(reading.facts).toEqual([
      { label: 'Most went out: Feb', value: 'CHF 900', href: 'cell:Feb/Expense' },
      { label: 'Kept per month, on average', value: 'CHF 433.33', href: null },
    ]);
  });

  it('draws what came in and went out per row, whichever column holds the income', () => {
    const flow = source(
      ['Jan', 'Feb', 'Mar'],
      ['Expense', 'Income'],
      [
        [-600_00, 1000_00],
        [-900_00, 1000_00],
        [-300_00, 1500_00],
      ],
    );

    expect(read(widget({ visualisation: 'stacked_bar', data: flow })).mark).toEqual({
      type: 'dots',
      months: [
        month('Jan', 1000_00, 600_00),
        month('Feb', 1000_00, 900_00),
        month('Mar', 1500_00, 300_00),
      ],
    });
  });

  it('reads the income from the column with the larger total, even after a refund month', () => {
    // The expense column comes first and one refund turns a month of it positive.
    const refunded = read(
      widget({
        visualisation: 'stacked_bar',
        data: source(
          ['Jan', 'Feb', 'Mar'],
          ['Expense', 'Income'],
          [
            [-600_00, 1000_00],
            [50_00, 1000_00],
            [-700_00, 1500_00],
          ],
        ),
      }),
    );

    expect(refunded.lead).toEqual({
      headline: 'Most came in: Mar',
      detail: 'CHF 1500',
      href: 'cell:Mar/Income',
    });
    expect(refunded.facts[0]).toEqual({
      label: 'Most went out: Mar',
      value: 'CHF 700',
      href: 'cell:Mar/Expense',
    });
    // The sentence and the dots read the same columns.
    expect(refunded.mark).toMatchObject({
      type: 'dots',
      months: [{ income: 1000_00 }, { income: 1000_00 }, { income: 1500_00 }],
    });
  });

  it('tells and draws a line of income vs. expense as a flow, as it does bars', () => {
    const line = read(widget({ visualisation: 'line', data: incomeVsExpense.data }));
    const bars = read(incomeVsExpense);

    expect(line.kind).toBe('trend');
    expect({ ...line, kind: 'bars' }).toEqual(bars);
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

    expect(read(widget({ visualisation: 'stacked_bar', data: gaps })).flow?.months).toEqual([
      month('Jan', 1000_00, 0),
      month('Feb', 0, 200_00),
    ]);
  });

  it('opens what was kept per month on income and expense together, averaged per month', () => {
    const flow = drillable(
      source(
        ['2025-01', '2025-02'],
        ['income', 'expense'],
        [
          [1000_00, -600_00],
          [1000_00, -900_00],
        ],
      ),
      'month',
      'categoryGroupType',
    );

    const kept = read(widget({ visualisation: 'stacked_bar', data: flow })).facts[1]!;

    expect(kept.value).toBe('CHF 250');
    expect(drillOf(kept.href)).toMatchObject({
      cell: { page: 1 },
      measure: 'average',
      per: 'month',
    });
  });

  it('tells yearly income vs. expense as kept per year', () => {
    const yearly = widget({
      visualisation: 'stacked_bar',
      data: source(
        ['2024', '2025'],
        ['Income', 'Expense'],
        [
          [1000_00, -600_00],
          [1200_00, -800_00],
        ],
      ),
    });

    expect(read(yearly).facts.at(-1)).toMatchObject({
      label: 'Kept per year, on average',
      value: 'CHF 400',
    });
    expect(read(yearly).flow?.period).toBe('year');
  });

  it('tells monthly income vs. expense flows as months', () => {
    expect(read(incomeVsExpense).flow?.period).toBe('month');
  });
});

describe('readCard: its flow', () => {
  const partial = source(
    ['2025-01', '2025-02', '2025-03'],
    ['expense', 'income'],
    [
      [-600_00, 1000_00],
      [-900_00, 1000_00],
      [-30_00, 0],
    ],
    { lastIsPartial: true },
  );

  it('is null unless the data holds one income and one expense column', () => {
    expect(read(spending).flow).toBeNull();
    expect(read(balances).flow).toBeNull();
    expect(read(widget({ data: source(['Jan'], ['Net'], [[400_00]]) })).flow).toBeNull();
    expect(read(widget({ data: null })).flow).toBeNull();
  });

  it('links what was kept to the grand total, and the latest full month to that month only', () => {
    expect(read(widget({ visualisation: 'stacked_bar', data: partial })).flow).toMatchObject({
      href: 'total',
      latestHref: 'row:2025-02',
    });
  });

  it("opens the insight's change on the expense of every full month, subtotalled", () => {
    const data: ChartSource = {
      ...partial,
      drill: {
        query: { ...DEFAULT_WIDGET_QUERY, rows: 'month', columns: 'categoryGroupType' },
        origin: { kind: 'dashboard', id: '0b6f4c1e-3a52-4d8e-9a7e-1f2d3c4b5a60' },
      },
    };

    const { changeHref } = read(widget({ visualisation: 'stacked_bar', data })).flow!;

    expect(drillOf(changeHref)).toMatchObject({
      cell: { row: { except: ['2025-03'] }, column: 'expense', withPeriodSubtotals: true, page: 1 },
      origin: 'dashboard',
    });
    // Without Drill-downs there is nothing to open.
    expect(read(incomeVsExpense).flow?.changeHref).toBeNull();
  });
});

describe('readCard: periods', () => {
  it('names the leading Category, then the heaviest and lightest months of spending', () => {
    const reading = read(spending);

    expect(reading.lead).toEqual({
      headline: 'Rent leads',
      detail: 'CHF -6000',
      href: 'column:Home › Rent',
    });
    expect(reading.facts).toEqual([
      { label: 'Heaviest month: Feb', value: 'CHF -3400', href: 'row:Feb' },
      { label: 'Lightest month: Mar', value: 'CHF -2400', href: 'row:Mar' },
      // Without Drill-downs (the fixture has none), an average has nowhere to open.
      { label: 'Monthly average', value: 'CHF -2800', href: null },
    ]);
  });

  it('opens the monthly average on the whole range, as an average per month', () => {
    const monthly = drillable(
      source(['2025-01', '2025-02', '2025-03'], ['Rent'], [[-500_00], [-900_00], [-701_00]]),
      'month',
      'category',
    );

    const average = read(widget({ data: monthly })).facts.at(-1)!;

    expect(average.value).toBe('CHF -700.33');
    expect(drillOf(average.href)).toMatchObject({
      cell: { page: 1 },
      measure: 'average',
      per: 'month',
    });
  });

  it('leaves a running period out of the average, opening the complete periods only', () => {
    const toDate = drillable(
      source(['2025-01', '2025-02', '2025-03'], ['Rent'], [[-500_00], [-900_00], [-100_00]], {
        lastIsPartial: true,
      }),
      'month',
      'category',
    );

    const average = read(widget({ data: toDate })).facts.at(-1)!;

    expect(average.value).toBe('CHF -700');
    expect(drillOf(average.href)).toMatchObject({
      cell: { row: { except: ['2025-03'] } },
      measure: 'average',
      per: 'month',
    });
  });

  it('rounds the average half away from zero, as the Drill-down does', () => {
    // -5 over 2 months is -2.5: the engine's average is -3.
    const odd = widget({ data: source(['2025-01', '2025-02'], ['Net'], [[-2], [-3]]) });

    expect(readCard(odd, String).facts.at(-1)?.value).toBe('-3');
  });

  it('rounds the monthly average to whole minor units, as the formatter requires', () => {
    const odd = widget({ data: source(['Jan', 'Feb', 'Mar'], ['Net'], [[100], [100], [101]]) });

    expect(readCard(odd, String).facts.at(-1)).toMatchObject({
      label: 'Monthly average',
      value: '100',
    });
  });

  it('calls the months of a net flow its best and weakest, drawn as bars', () => {
    const netFlow = widget({
      data: source(['Jan', 'Feb'], ['Net'], [[400_00], [100_00]], { lastIsPartial: true }),
    });

    const reading = read(netFlow);

    expect(reading.lead).toEqual({
      headline: 'Best net month: Jan',
      detail: 'CHF 400',
      href: 'row:Jan',
    });
    expect(reading.facts[0]).toEqual({
      label: 'Weakest month: Feb (partial)',
      value: 'CHF 100',
      href: 'row:Feb',
    });
    expect(reading.mark).toEqual({
      type: 'bars',
      periods: [
        { label: 'Jan', value: 400_00, href: 'row:Jan', isPartial: false },
        { label: 'Feb', value: 100_00, href: 'row:Feb', isPartial: true },
      ],
    });
  });

  it('leaves months without any spending out of the lightest month', () => {
    const quiet = widget({
      visualisation: 'stacked_bar',
      data: source(['Jan', 'Feb', 'Mar'], ['Rent'], [[0], [-500_00], [-300_00]]),
    });

    expect(read(quiet).facts[0]).toMatchObject({ label: 'Lightest month: Mar', value: 'CHF -300' });
  });

  it('speaks of years when the Widget rows are years', () => {
    const yearly = widget({
      visualisation: 'stacked_bar',
      data: source(['2023', '2024', '2025'], ['Rent'], [[-500_00], [-900_00], [-700_00]]),
    });

    const reading = read(yearly);

    expect(reading.lead).toMatchObject({ headline: 'Heaviest year: 2024', detail: 'CHF -900' });
    expect(reading.facts).toMatchObject([
      { label: 'Lightest year: 2023', value: 'CHF -500' },
      { label: 'Yearly average', value: 'CHF -700' },
    ]);
  });

  it('speaks of quarters when the Widget rows are quarters', () => {
    const quarterly = widget({
      data: source(['2025-Q1', '2025-Q2'], ['Net'], [[400_00], [100_00]]),
    });

    const reading = read(quarterly);

    expect(reading.lead).toMatchObject({
      headline: 'Best net quarter: 2025-Q1',
      detail: 'CHF 400',
    });
    expect(reading.facts).toMatchObject([
      { label: 'Weakest quarter: 2025-Q2', value: 'CHF 100' },
      { label: 'Quarterly average', value: 'CHF 250' },
    ]);
  });
});

describe('readCard: parts', () => {
  it("lists a ranking card's Categories by money over the period, largest first", () => {
    const { mark } = read(spending);

    expect(mark).toMatchObject({
      type: 'ticks',
      items: [
        { title: 'Rent', detail: 'Home · CHF -6000', href: 'column:Home › Rent' },
        { title: 'Groceries', detail: 'Living · CHF -1300', href: 'column:Living › Groceries' },
        { title: 'Travel', detail: 'Leisure · CHF -1100', href: 'column:Leisure › Travel' },
      ],
    });
  });

  it('lists at most six parts, the folded "Other" opening every column but the ranked ones', () => {
    const columns = Array.from({ length: 9 }, (_, index) => `C${index}`);
    // The last columns are the largest, so "Other" (C7 and C8 folded) leads.
    const data = drillable(
      source(['2025-01'], columns, [columns.map((_, index) => -(index + 1) * 100)]),
      'month',
      'category',
    );

    const { mark } = read(widget({ visualisation: 'stacked_bar', data }));
    if (mark.type !== 'ticks') throw new Error(`expected ticks, got ${mark.type}`);

    expect(mark.items).toHaveLength(6);
    expect(mark.items[0]).toMatchObject({ title: 'Other', detail: 'CHF -17' });
    expect(drillOf(mark.items[0]!.href).cell).toEqual({
      column: { except: columns.slice(0, 7) },
      page: 1,
    });
  });

  it('says how much of the whole sits in the largest part, and gives each part its share', () => {
    const reading = read(balances);

    expect(reading.lead).toMatchObject({
      headline: '60% sits in UBS · Savings',
      detail: 'CHF 6000 of CHF 10000',
    });
    if (reading.mark.type !== 'ticks') throw new Error(`expected ticks, got ${reading.mark.type}`);
    expect(reading.mark.items.map(({ title, share }) => [title, share])).toEqual([
      ['UBS · Savings', 0.6],
      ['UBS · Current', 0.3],
      ['BCGE · Pillar 3a', 0.1],
    ]);
    expect(reading.mark.items[0]).toMatchObject({ detail: 'CHF 6000', href: 'row:UBS · Savings' });
  });

  it('names the largest row of a table mixing money in and out, with no share of its net', () => {
    const data = source(
      ['Income', 'Expense'],
      ['Jan', 'Feb'],
      [
        [500_00, 400_00],
        [-300_00, -200_00],
      ],
    );

    expect(read(widget({ visualisation: 'table', data })).lead).toEqual({
      headline: 'Income leads',
      detail: 'CHF 900',
      href: 'row:Income',
    });
  });

  it('draws a donut as a ring and a table as a heatmap, both from the data', () => {
    const data = spending.data!;

    expect(read(widget({ visualisation: 'donut', data })).mark).toEqual({ type: 'ring', data });
    expect(read(widget({ visualisation: 'table', data })).mark).toEqual({ type: 'grid', data });
  });
});

describe('readCard: a number, no data and no rows', () => {
  it('draws a number Widget as its total, with nothing else to say', () => {
    const reading = read(widget({ visualisation: 'number', data: spending.data }));

    expect(reading).toMatchObject({
      lead: null,
      facts: [],
      mark: { type: 'number', total: -8400_00, href: 'total' },
    });
  });

  it('says and draws nothing when its query gave no data', () => {
    expect(read(widget({ data: null }))).toEqual({
      kind: 'trend',
      lead: null,
      facts: [],
      mark: { type: 'none' },
      flow: null,
    });
  });

  it('says there is no data yet when the date range has no rows, without an empty chart', () => {
    const reading = read(widget({ data: source([], ['Net'], []) }));

    expect(reading).toMatchObject({
      lead: null,
      facts: [],
      mark: { type: 'empty', sentence: 'No data in this date range yet.' },
    });
  });

  it('says no Account matches when a balances Widget has no Account to show', () => {
    const reading = read({ ...balances, data: source([], ['Balance'], []) });

    expect(reading).toMatchObject({
      kind: 'share',
      lead: null,
      facts: [],
      mark: { type: 'emptyChart', sentence: "No Account matches this Widget's filters." },
    });
  });
});

type KindValues = Partial<Record<'current' | 'savings' | '3a' | 'loan', number>>;

const KIND_LABELS = { current: 'Current', savings: 'Savings', '3a': '3a', loan: 'Loan' };

/**
 * Net worth over time as the loader passes it: one row per period (key and label), one column
 * per account kind (a plain number is all savings), each row's total its Net worth and the
 * range's values the latest point's. Every point links to the Accounts as of its last day, a
 * band's point to that kind's Accounts.
 */
function netWorth(
  points: [key: string, label: string, values: number | KindValues][],
  { lastIsPartial = false } = {},
): CardWidget {
  const perKind = points.map(([, , values]) =>
    typeof values === 'number' ? { savings: values } : values,
  );
  const kinds = (['current', 'savings', '3a', 'loan'] as const).filter((kind) =>
    perKind.some((values) => kind in values),
  );
  const cells = perKind.map((values) => kinds.map((kind) => values[kind] ?? 0));
  const rowTotals = cells.map((row) => row.reduce((a, v) => a + v, 0));
  const latest = rowTotals.at(-1) ?? null;
  return widget({
    id: 'net-worth',
    name: 'Net worth',
    source: 'account_balances',
    visualisation: 'line',
    query: { rows: 'month' },
    data: {
      measure: 'sum',
      rows: points.map(([key, label], r) => ({
        key,
        label,
        isPartial: lastIsPartial && r === points.length - 1,
      })),
      columns: kinds.map((kind) => ({ key: kind, label: KIND_LABELS[kind], isPartial: false })),
      cells,
      rowTotals,
      columnTotals: cells.at(-1) ?? kinds.map(() => null),
      total: latest,
      hrefs: {
        cells: points.map(([key]) => kinds.map((kind) => `accounts:${key}:${kind}`)),
        rowTotals: points.map(([key]) => `accounts:${key}`),
        columnTotals: kinds.map((kind) => `accounts:latest:${kind}`),
        total: 'accounts:latest',
      },
      drill: null,
    },
  });
}

describe('readCard: Net worth over time', () => {
  const rising = netWorth([
    ['2025-01', 'Jan 2025', 1000_00],
    ['2025-02', 'Feb 2025', 1200_00],
    ['2025-03', 'Mar 2025', 1500_00],
  ]);

  it('says what Net worth was at the end of the latest period and how far it rose', () => {
    const reading = read(rising);

    expect(reading.kind).toBe('netWorthTrend');
    expect(reading.lead).toEqual({
      headline:
        'Net worth was CHF 1500 at the end of Mar 2025, up CHF 500 over Jan 2025 – Mar 2025.',
      detail: 'CHF 1500',
      href: 'accounts:2025-03',
    });
    expect(reading.facts[0]).toEqual({
      label: 'Change over Jan 2025 – Mar 2025',
      value: '+CHF 500',
      href: 'accounts:2025-03',
    });
  });

  it('draws the line, each point opening the Accounts as of its period', () => {
    expect(read(rising).mark).toMatchObject({
      type: 'netWorthLine',
      points: [
        { label: 'Jan 2025', value: 1000_00, href: 'accounts:2025-01', isPartial: false },
        { label: 'Feb 2025', value: 1200_00, href: 'accounts:2025-02', isPartial: false },
        { label: 'Mar 2025', value: 1500_00, href: 'accounts:2025-03', isPartial: false },
      ],
    });
  });

  const split = netWorth([
    ['2025-01', 'Jan 2025', { current: 200_00, savings: 600_00, loan: -500_00 }],
    ['2025-02', 'Feb 2025', { current: 300_00, '3a': 100_00, savings: 600_00, loan: -500_00 }],
  ]);

  it('draws a band per Account kind under the line, each point opening that kind as of its date', () => {
    const mark = read(split).mark;

    expect(mark).toMatchObject({ type: 'netWorthLine' });
    expect(mark.type === 'netWorthLine' && mark.bands).toEqual([
      {
        key: 'current',
        label: 'Current',
        points: [
          { label: 'Jan 2025', value: 200_00, href: 'accounts:2025-01:current', isPartial: false },
          { label: 'Feb 2025', value: 300_00, href: 'accounts:2025-02:current', isPartial: false },
        ],
      },
      {
        key: 'savings',
        label: 'Savings',
        points: [
          { label: 'Jan 2025', value: 600_00, href: 'accounts:2025-01:savings', isPartial: false },
          { label: 'Feb 2025', value: 600_00, href: 'accounts:2025-02:savings', isPartial: false },
        ],
      },
      {
        key: '3a',
        label: '3a',
        points: [
          { label: 'Jan 2025', value: 0, href: 'accounts:2025-01:3a', isPartial: false },
          { label: 'Feb 2025', value: 100_00, href: 'accounts:2025-02:3a', isPartial: false },
        ],
      },
      {
        key: 'loan',
        label: 'Loan',
        points: [
          { label: 'Jan 2025', value: -500_00, href: 'accounts:2025-01:loan', isPartial: false },
          { label: 'Feb 2025', value: -500_00, href: 'accounts:2025-02:loan', isPartial: false },
        ],
      },
    ]);
  });

  it("gives each Account kind's share at the latest point, linking to that kind's Accounts then", () => {
    // Shares of everything held or owed (1500 in all), as the balances share card sizes parts.
    expect(read(split).facts.slice(1)).toEqual([
      { label: 'Current', value: 'CHF 300 · 20%', href: 'accounts:2025-02:current' },
      { label: 'Savings', value: 'CHF 600 · 40%', href: 'accounts:2025-02:savings' },
      { label: '3a', value: 'CHF 100 · 7%', href: 'accounts:2025-02:3a' },
      { label: 'Loan', value: 'CHF -500 · 33%', href: 'accounts:2025-02:loan' },
    ]);
  });

  it('leaves out a kind that holds nothing at the latest point', () => {
    const reading = read(
      netWorth([
        ['2025-01', 'Jan 2025', { current: 100_00, savings: 300_00 }],
        ['2025-02', 'Feb 2025', { current: 0, savings: 300_00 }],
      ]),
    );

    expect(reading.facts.slice(1)).toEqual([
      { label: 'Savings', value: 'CHF 300 · 100%', href: 'accounts:2025-02:savings' },
    ]);
  });

  it('says how far it fell', () => {
    const reading = read(
      netWorth([
        ['2025', '2025', 5000_00],
        ['2026', '2026', 4200_00],
      ]),
    );

    expect(reading.lead?.headline).toBe(
      'Net worth was CHF 4200 at the end of 2026, down CHF 800 over 2025 – 2026.',
    );
    expect(reading.facts[0]).toMatchObject({ value: 'CHF -800' });
  });

  it('says when it is unchanged', () => {
    const reading = read(
      netWorth([
        ['2025-Q1', 'Q1 2025', 300_00],
        ['2025-Q2', 'Q2 2025', 300_00],
      ]),
    );

    expect(reading.lead?.headline).toBe(
      'Net worth was CHF 300 at the end of Q2 2025, unchanged over Q1 2025 – Q2 2025.',
    );
    expect(reading.facts[0]).toMatchObject({ value: 'CHF 0' });
  });

  it('speaks of the current period so far, not its end', () => {
    const reading = read(
      netWorth(
        [
          ['2025-02', 'Feb 2025', 1000_00],
          ['2025-03', 'Mar 2025', 900_00],
        ],
        { lastIsPartial: true },
      ),
    );

    expect(reading.lead?.headline).toBe(
      'Net worth is CHF 900 so far in Mar 2025, down CHF 100 over Feb 2025 – Mar 2025.',
    );
  });

  describe('with Capital movements', () => {
    const marker = (date: string, amountMinor: number | null, label: string) => ({
      transactionId: `tx-${date}`,
      lineId: null,
      date,
      amountMinor,
      label,
      href: `/transactions/tx-${date}`,
    });
    const withMarkers = (markers: ReturnType<typeof marker>[]): CardWidget => ({
      ...rising,
      data: { ...rising.data!, capital: { markers, href: '/transactions?groupType=capital' } },
    });

    it('counts the Capital movements in the range, opening their list', () => {
      const reading = read(
        withMarkers([
          marker('2025-01-31', -300_000_00, 'Notary Dupont'),
          marker('2025-03-16', 50_000_00, 'Inheritance'),
        ]),
      );

      expect(reading.facts).toContainEqual({
        label: 'Capital movements',
        value: '2',
        href: '/transactions?groupType=capital',
      });
    });

    it('says when there were none', () => {
      expect(read(withMarkers([])).facts).toContainEqual({
        label: 'Capital movements',
        value: '0',
        href: '/transactions?groupType=capital',
      });
    });

    it('places each marker on the line at its date, opening its Transaction', () => {
      const mark = read(
        withMarkers([
          marker('2025-01-31', -300_000_00, 'Notary Dupont'),
          marker('2025-02-14', null, 'Property'),
          marker('2025-03-31', 50_000_00, 'Inheritance'),
        ]),
      ).mark;

      // Points stand at each month's last day: Jan at 0, Feb at 1, Mar at 2. 14 Feb is half of
      // February past January's point.
      expect(mark).toMatchObject({
        type: 'netWorthLine',
        markers: [
          {
            at: 0,
            date: '2025-01-31',
            title: 'Notary Dupont: CHF -300000',
            href: '/transactions/tx-2025-01-31',
          },
          {
            at: 0.5,
            date: '2025-02-14',
            title: 'Property',
            href: '/transactions/tx-2025-02-14',
          },
          {
            at: 2,
            date: '2025-03-31',
            title: 'Inheritance: CHF 50000',
            href: '/transactions/tx-2025-03-31',
          },
        ],
      });
    });
  });

  it('draws an empty chart saying so when the filters leave no Account', () => {
    expect(read(netWorth([]))).toMatchObject({
      kind: 'netWorthTrend',
      lead: null,
      facts: [],
      mark: { type: 'emptyChart', sentence: "No Account matches this Widget's filters." },
    });
  });
});

describe('STORY_SHOWN_AS', () => {
  const kindWords: Record<string, string> = {
    share: 'share',
    grid: 'heatmap',
    trend: 'trend',
    bars: 'bars',
    ranking: 'ranking',
    number: 'number',
    ring: 'ring',
  };

  it('names the card each visualisation becomes', () => {
    for (const visualisation of ['table', 'line', 'stacked_bar', 'donut', 'number'] as const) {
      const { kind } = cardFrame(framed('query', visualisation, 2));
      expect(STORY_SHOWN_AS[visualisation].full).toContain(kindWords[kind]);
    }
  });

  it('mentions the ranking a stacked bar becomes with many series', () => {
    expect(cardFrame(framed('query', 'stacked_bar', 3)).kind).toBe('ranking');
    expect(STORY_SHOWN_AS.stacked_bar.full).toContain('ranking');
  });
});

describe('latestFullIndex', () => {
  it('is the last row that is not partial, or -1 when every row is', () => {
    expect(latestFullIndex([header('Jan'), header('Feb'), header('Mar', true)])).toBe(1);
    expect(latestFullIndex([header('Mar', true)])).toBe(-1);
  });
});

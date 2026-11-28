import { describe, expect, it } from 'vitest';
import type { ChartSource } from './chart-data';
import { DEFAULT_WIDGET_QUERY } from './widget-params';
import {
  balances,
  drillable,
  drillOf,
  incomeVsExpense,
  month,
  read,
  source,
  spending,
  widget,
} from '@test/support/card';

describe('readCard: income vs. expense', () => {
  it('tells bars by its sentence and Profit, then its biggest months in and out', () => {
    const reading = read(incomeVsExpense);

    expect(reading.lead).toEqual({
      headline: 'Income beat expense in 3 of 3 complete months.',
      detail: 'CHF 1300',
      href: 'total',
    });
    expect(reading.facts).toEqual([
      { label: 'Most came in: Mar', value: 'CHF 1500', href: 'cell:Mar/Income' },
      { label: 'Most went out: Feb', value: 'CHF 900', href: 'cell:Feb/Expense' },
      { label: 'Kept per month, on average', value: 'CHF 433.33', href: null },
    ]);
  });

  it('draws a bars flow as grouped bars, a pair per row, whichever column holds the income', () => {
    const flow = source(
      ['2025-01', '2025-02', '2025-03'],
      ['Expense', 'Income'],
      [
        [-600_00, 1000_00],
        [-900_00, 1000_00],
        [-300_00, 1500_00],
      ],
    );

    expect(read(widget({ visualisation: 'stacked_bar', data: flow })).mark).toEqual({
      type: 'groupedBars',
      intervals: [
        {
          label: '2025-01',
          key: '2025-01',
          isPartial: false,
          income: 1000_00,
          expense: 600_00,
          incomeHref: 'cell:2025-01/Income',
          expenseHref: 'cell:2025-01/Expense',
        },
        {
          label: '2025-02',
          key: '2025-02',
          isPartial: false,
          income: 1000_00,
          expense: 900_00,
          incomeHref: 'cell:2025-02/Income',
          expenseHref: 'cell:2025-02/Expense',
        },
        {
          label: '2025-03',
          key: '2025-03',
          isPartial: false,
          income: 1500_00,
          expense: 300_00,
          incomeHref: 'cell:2025-03/Income',
          expenseHref: 'cell:2025-03/Expense',
        },
      ],
    });
  });

  it('draws a bar pair for every Interval, not the last six, the partial first and last flagged', () => {
    const quarters = ['2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q2'];
    const data = source(
      quarters,
      ['Income', 'Expense'],
      quarters.map(() => [1000_00, -500_00]),
    );
    const cutShort = {
      ...data,
      rows: data.rows.map((row, r) => ({
        ...row,
        isPartial: r === 0 || r === quarters.length - 1,
      })),
    };

    const { mark } = read(widget({ visualisation: 'stacked_bar', data: cutShort }));

    if (mark.type !== 'groupedBars') throw new Error(`expected grouped bars, got ${mark.type}`);
    expect(mark.intervals.map(({ key, isPartial }) => ({ key, isPartial }))).toEqual([
      { key: '2023-Q4', isPartial: true },
      { key: '2024-Q1', isPartial: false },
      { key: '2024-Q2', isPartial: false },
      { key: '2024-Q3', isPartial: false },
      { key: '2024-Q4', isPartial: false },
      { key: '2025-Q1', isPartial: false },
      { key: '2025-Q2', isPartial: true },
    ]);
  });

  it('keeps the sign of a side that nets the wrong way, never clamping it', () => {
    const refunds = source(
      ['2025-01', '2025-02'],
      ['Income', 'Expense'],
      [
        // Refunds outweigh spending: what went out nets below zero.
        [1000_00, 50_00],
        // A reversed salary: what came in nets below zero.
        [-200_00, -300_00],
      ],
    );

    const { mark } = read(widget({ visualisation: 'stacked_bar', data: refunds }));

    if (mark.type !== 'groupedBars') throw new Error(`expected grouped bars, got ${mark.type}`);
    expect(mark.intervals.map(({ income, expense }) => ({ income, expense }))).toEqual([
      { income: 1000_00, expense: -50_00 },
      { income: -200_00, expense: 300_00 },
    ]);
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

    expect(refunded.facts[0]).toEqual({
      label: 'Most came in: Mar',
      value: 'CHF 1500',
      href: 'cell:Mar/Income',
    });
    expect(refunded.facts[1]).toEqual({
      label: 'Most went out: Mar',
      value: 'CHF 700',
      href: 'cell:Mar/Expense',
    });
    // The sentence and the bars read the same columns.
    expect(refunded.mark).toMatchObject({
      type: 'groupedBars',
      intervals: [{ income: 1000_00 }, { income: 1000_00 }, { income: 1500_00 }],
    });
  });

  it('tells a line of income vs. expense as a flow, by the figures bars give under its sentence', () => {
    const line = read(widget({ visualisation: 'line', data: incomeVsExpense.data }));
    const bars = read(incomeVsExpense);

    expect(line.kind).toBe('trend');
    expect(line.lead).toEqual({
      headline: 'Most came in: Mar',
      detail: 'CHF 1500',
      href: 'cell:Mar/Income',
    });
    expect([
      { label: line.lead!.headline, value: line.lead!.detail, href: line.lead!.href },
      ...line.facts,
    ]).toEqual(bars.facts);
    expect(line.flow).toEqual(bars.flow);
  });

  it("draws a line flow as two areas, each point that row's own income and expense", () => {
    const flow = source(
      ['2025-01', '2025-02', '2025-03'],
      ['expense', 'income'],
      [
        [-600_00, 1000_00],
        [50_00, 1000_00],
        [-300_00, 0],
      ],
      { lastIsPartial: true },
    );

    expect(read(widget({ visualisation: 'line', data: flow })).mark).toEqual({
      type: 'areas',
      isRunning: false,
      points: [
        {
          label: '2025-01',
          key: '2025-01',
          isPartial: false,
          income: 1000_00,
          expense: 600_00,
          href: 'row:2025-01',
          incomeHref: 'cell:2025-01/income',
          expenseHref: 'cell:2025-01/expense',
        },
        {
          label: '2025-02',
          key: '2025-02',
          isPartial: false,
          // A refund month: what went out nets below zero.
          income: 1000_00,
          expense: -50_00,
          href: 'row:2025-02',
          incomeHref: 'cell:2025-02/income',
          expenseHref: 'cell:2025-02/expense',
        },
        {
          label: '2025-03',
          key: '2025-03',
          isPartial: true,
          income: 0,
          expense: 300_00,
          href: 'row:2025-03',
          incomeHref: 'cell:2025-03/income',
          expenseHref: 'cell:2025-03/expense',
        },
      ],
    });
  });

  it('draws a line flow by day as running totals from its first day, each point opening the days through it', () => {
    const days = drillable(
      source(
        ['2025-03-01', '2025-03-02', '2025-03-03', '2025-03-04'],
        ['Income', 'Expense'],
        [
          [5000_00, -40_00],
          [null, null],
          // A refund: what went out so far falls.
          [null, 10_00],
          [null, -60_00],
        ],
        { lastIsPartial: true },
      ),
      'day',
      'categoryGroupType',
    );

    const { mark } = read(widget({ visualisation: 'line', data: days }));

    if (mark.type !== 'areas') throw new Error(`expected areas, got ${mark.type}`);
    expect(mark.isRunning).toBe(true);
    expect(
      mark.points.map(({ key, income, expense, isPartial }) => ({
        key,
        income,
        expense,
        isPartial,
      })),
    ).toEqual([
      { key: '2025-03-01', income: 5000_00, expense: 40_00, isPartial: false },
      // A quiet day keeps the totals flat.
      { key: '2025-03-02', income: 5000_00, expense: 40_00, isPartial: false },
      { key: '2025-03-03', income: 5000_00, expense: 30_00, isPartial: false },
      { key: '2025-03-04', income: 5000_00, expense: 90_00, isPartial: true },
    ]);
    const second = mark.points[1]!;
    expect(drillOf(second.incomeHref).cell).toMatchObject({
      row: { through: '2025-03-02' },
      column: 'Income',
    });
    expect(drillOf(second.expenseHref).cell).toMatchObject({
      row: { through: '2025-03-02' },
      column: 'Expense',
    });
    expect(drillOf(second.href).cell).toMatchObject({ row: { through: '2025-03-02' } });
    expect(drillOf(second.href).cell.column).toBeUndefined();
  });

  it('tells a line flow by day as what was kept so far, what came in and what went out', () => {
    const days = source(
      ['2025-03-01', '2025-03-02', '2025-03-03'],
      ['Expense', 'Income'],
      [
        [-40_00, 5000_00],
        [null, null],
        [-60_00, null],
      ],
      { lastIsPartial: true },
    );

    const reading = read(widget({ visualisation: 'line', data: days }));

    expect(reading.lead).toEqual({ headline: 'Profit', detail: 'CHF 4900', href: 'total' });
    expect(reading.facts).toEqual([
      { label: 'Came in', value: 'CHF 5000', href: 'column:Income' },
      { label: 'Went out', value: 'CHF 100', href: 'column:Expense' },
    ]);
  });

  it('tells a bars flow by day by its days, today to date, drawn as grouped bars', () => {
    const days = source(
      ['2025-03-01', '2025-03-02', '2025-03-03'],
      ['Income', 'Expense'],
      [
        [5000_00, -40_00],
        [null, null],
        [null, -60_00],
      ],
      { lastIsPartial: true },
    );

    const reading = read(widget({ visualisation: 'stacked_bar', data: days }));

    expect(reading.lead).toMatchObject({ headline: 'Most came in: 2025-03-01' });
    expect(reading.facts.map((fact) => fact.label)).toEqual([
      'Most went out: 2025-03-03 (to date)',
      'Kept per day, on average',
    ]);
    expect(reading.mark.type).toBe('groupedBars');
  });

  it('says there is no data yet for a bars flow with no Interval, as any card does', () => {
    const reading = read(
      widget({ visualisation: 'stacked_bar', data: source([], ['Income', 'Expense'], []) }),
    );

    expect(reading).toMatchObject({
      lead: null,
      facts: [],
      mark: { type: 'empty', sentence: 'No data in this date range yet.' },
    });
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

    const kept = read(widget({ visualisation: 'stacked_bar', data: flow })).facts.at(-1)!;

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

describe('readCard: a bars flow sentence', () => {
  const bars = (data: ChartSource) => read(widget({ visualisation: 'stacked_bar', data }));

  it('counts the complete months income beat expense, then the running one so far', () => {
    const reading = bars(
      source(
        ['2025-01', '2025-02', '2025-03', '2025-04'],
        ['Income', 'Expense'],
        [
          [1000_00, -600_00],
          [800_00, -900_00],
          [1500_00, -700_00],
          [3200_00, -2900_00],
        ],
        { lastIsPartial: true },
      ),
    );

    expect(reading.lead?.headline).toBe(
      'Income beat expense in 2 of 3 complete months; this month so far: in CHF 3200, out CHF 2900.',
    );
  });

  it('speaks of quarters for a quarterly flow', () => {
    const reading = bars(
      source(
        ['2025-Q1', '2025-Q2', '2025-Q3'],
        ['Income', 'Expense'],
        [
          [3000_00, -2000_00],
          [3000_00, -3500_00],
          [1000_00, -400_00],
        ],
        { lastIsPartial: true },
      ),
    );

    expect(reading.lead?.headline).toBe(
      'Income beat expense in 1 of 2 complete quarters; this quarter so far: in CHF 1000, out CHF 400.',
    );
  });

  it('speaks of years for a yearly flow, with no running clause when every year is complete', () => {
    const reading = bars(
      source(
        ['2023', '2024', '2025'],
        ['Income', 'Expense'],
        [
          [12000_00, -10000_00],
          [12000_00, -11000_00],
          [12000_00, -13000_00],
        ],
      ),
    );

    expect(reading.lead?.headline).toBe('Income beat expense in 2 of 3 complete years.');
  });

  it('gives only the running clause when no interval is complete, never "0 of 0"', () => {
    const reading = bars(
      source(['2025-03'], ['Income', 'Expense'], [[3200_00, -2900_00]], { lastIsPartial: true }),
    );

    expect(reading.lead?.headline).toBe('This month so far: in CHF 3200, out CHF 2900.');
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

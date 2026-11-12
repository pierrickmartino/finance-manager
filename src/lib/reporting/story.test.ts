import { describe, expect, it } from 'vitest';
import type { ReportAxis, ReportHeader } from '@/server/services/reporting';
import type { ChartSource } from './chart-data';
import { cellFromParams, DEFAULT_WIDGET_QUERY } from './widget-params';
import {
  chapterKind,
  chapterStory,
  rankedTotals,
  savingsRate,
  shareParts,
  STORY_SHOWN_AS,
  storyHero,
  type StoryWidget,
} from './story';

const header = (label: string): ReportHeader => ({ key: label, label, isPartial: false });

/** A source from a grid of cells, totals computed, links naming what they point at. */
function source(rows: string[], columns: string[], cells: (number | null)[][]): ChartSource {
  const sum = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const rowTotals = cells.map(sum);
  const columnTotals = columns.map((_, c) => sum(cells.map((row) => row[c] ?? null)));
  return {
    measure: 'sum',
    rows: rows.map(header),
    columns: columns.map(header),
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
  return { cell: cellFromParams(grouped), measure: params.get('measure'), per: params.get('per') };
}

function widget(overrides: Partial<StoryWidget> & Pick<StoryWidget, 'data'>): StoryWidget {
  return {
    id: 'w1',
    name: 'Widget',
    source: 'query',
    visualisation: 'line',
    ...overrides,
  };
}

/** Plain money text so assertions read in francs (values are minor units). */
const money = (minor: number) => `CHF ${minor / 100}`;

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

describe('savingsRate', () => {
  it('is the share of income left after expense, from one positive and one negative column', () => {
    // Arrange: income 3'500, expense 2'200
    // Act
    const rate = savingsRate(incomeVsExpense.data!);
    // Assert
    expect(rate).toBeCloseTo(1300 / 3500);
  });

  it('is null unless the source has exactly one income and one expense column', () => {
    expect(savingsRate(spending.data!)).toBeNull();
    expect(savingsRate(balances.data!)).toBeNull();
  });
});

describe('storyHero', () => {
  it('leads with net worth from the Account balances and adds the year in and out', () => {
    const hero = storyHero([incomeVsExpense, balances]);

    expect(hero).toEqual({
      label: 'Your net worth today',
      value: 10000_00,
      href: 'total',
      flow: { income: 3500_00, expense: 2200_00, keptShare: 1300 / 3500 },
      sources: { value: balances.name, flow: incomeVsExpense.name },
    });
  });

  it('falls back to the first Widget with a total, without a flow sentence', () => {
    const hero = storyHero([spending]);

    expect(hero).toMatchObject({
      label: 'Spending by Category',
      value: -8400_00,
      flow: null,
      sources: { value: 'Spending by Category', flow: null },
    });
  });

  it('is null when no Widget has a total', () => {
    expect(storyHero([widget({ data: null })])).toBeNull();
  });
});

describe('chapterKind', () => {
  it.each([
    ['a number Widget', widget({ visualisation: 'number', data: spending.data }), 'number'],
    ['Account balances', balances, 'share'],
    ['a donut', widget({ visualisation: 'donut', data: spending.data }), 'ring'],
    ['a table', widget({ visualisation: 'table', data: spending.data }), 'grid'],
    ['a line', widget({ visualisation: 'line', data: incomeVsExpense.data }), 'trend'],
    ['a stacked bar with two series', incomeVsExpense, 'bars'],
    ['a stacked bar with many series', spending, 'ranking'],
  ] as const)('tells %s as %s', (_name, input, expected) => {
    expect(chapterKind(input)).toBe(expected);
  });
});

describe('chapterStory', () => {
  it('names the leading Category, then the heaviest and lightest months of spending', () => {
    const story = chapterStory(spending, money);

    expect(story.lead).toEqual({
      headline: 'Rent leads',
      detail: 'CHF -6000',
      href: 'column:Home › Rent',
    });
    expect(story.facts).toEqual([
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

    const average = chapterStory(widget({ data: monthly }), money).facts.at(-1)!;

    expect(average.value).toBe('CHF -700.33');
    expect(drillOf(average.href)).toEqual({ cell: { page: 1 }, measure: 'average', per: 'month' });
  });

  it('rounds the average half away from zero, as the Drill-down does', () => {
    // -5 over 2 months is -2.5: the engine's average is -3.
    const odd = widget({ data: source(['2025-01', '2025-02'], ['Net'], [[-2], [-3]]) });

    expect(chapterStory(odd, String).facts.at(-1)?.value).toBe('-3');
  });

  it('rounds the monthly average to whole minor units, as the formatter requires', () => {
    const odd = widget({ data: source(['Jan', 'Feb', 'Mar'], ['Net'], [[100], [100], [101]]) });

    expect(chapterStory(odd, String).facts.at(-1)).toMatchObject({
      label: 'Monthly average',
      value: '100',
    });
  });

  it('calls the months of a net flow its best and weakest', () => {
    const netFlow = widget({
      data: source(['Jan', 'Feb', 'Mar'], ['Net'], [[400_00], [100_00], [800_00]]),
    });

    const story = chapterStory(netFlow, money);

    expect(story.lead).toEqual({
      headline: 'Best net month: Mar',
      detail: 'CHF 800',
      href: 'row:Mar',
    });
    expect(story.facts[0]).toEqual({
      label: 'Weakest month: Feb',
      value: 'CHF 100',
      href: 'row:Feb',
    });
  });

  it('tells income vs. expense by its biggest months in and out, not by the net', () => {
    const story = chapterStory(incomeVsExpense, money);

    expect(story.lead).toEqual({
      headline: 'Most came in: Mar',
      detail: 'CHF 1500',
      href: 'cell:Mar/Income',
    });
    expect(story.facts).toEqual([
      { label: 'Most went out: Feb', value: 'CHF 900', href: 'cell:Feb/Expense' },
      { label: 'Kept per month, on average', value: 'CHF 433.33', href: null },
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

    const kept = chapterStory(widget({ visualisation: 'stacked_bar', data: flow }), money)
      .facts[1]!;

    expect(kept.value).toBe('CHF 250');
    expect(drillOf(kept.href)).toEqual({ cell: { page: 1 }, measure: 'average', per: 'month' });
  });

  it('leaves months without any spending out of the lightest month', () => {
    const quiet = widget({
      visualisation: 'stacked_bar',
      data: source(['Jan', 'Feb', 'Mar'], ['Rent'], [[0], [-500_00], [-300_00]]),
    });

    const story = chapterStory(quiet, money);

    expect(story.facts[0]).toMatchObject({ label: 'Lightest month: Mar', value: 'CHF -300' });
  });

  it('speaks of years when the Widget rows are years', () => {
    const yearly = widget({
      visualisation: 'stacked_bar',
      data: source(['2023', '2024', '2025'], ['Rent'], [[-500_00], [-900_00], [-700_00]]),
    });

    const story = chapterStory(yearly, money);

    expect(story.lead).toMatchObject({ headline: 'Heaviest year: 2024', detail: 'CHF -900' });
    expect(story.facts).toMatchObject([
      { label: 'Lightest year: 2023', value: 'CHF -500' },
      { label: 'Yearly average', value: 'CHF -700' },
    ]);
  });

  it('speaks of quarters when the Widget rows are quarters', () => {
    const quarterly = widget({
      data: source(['2025-Q1', '2025-Q2'], ['Net'], [[400_00], [100_00]]),
    });

    const story = chapterStory(quarterly, money);

    expect(story.lead).toMatchObject({ headline: 'Best net quarter: 2025-Q1', detail: 'CHF 400' });
    expect(story.facts).toMatchObject([
      { label: 'Weakest quarter: 2025-Q2', value: 'CHF 100' },
      { label: 'Quarterly average', value: 'CHF 250' },
    ]);
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

    const story = chapterStory(yearly, money);

    expect(story.facts.at(-1)).toMatchObject({
      label: 'Kept per year, on average',
      value: 'CHF 400',
    });
  });

  it('says how much of the whole sits in the largest part', () => {
    const story = chapterStory(balances, money);

    expect(story.lead).toMatchObject({
      headline: '60% sits in UBS · Savings',
      detail: 'CHF 6000 of CHF 10000',
    });
  });

  it('tells nothing when there is no data', () => {
    expect(chapterStory(widget({ data: null }), money)).toEqual({ lead: null, facts: [] });
  });
});

describe('rankedTotals', () => {
  it('ranks Categories by money over the period, largest first, split into group and name', () => {
    const ranked = rankedTotals(spending.data!, 2);

    expect(ranked).toEqual([
      { group: 'Home', name: 'Rent', value: -6000_00, href: 'column:Home › Rent' },
      { group: 'Living', name: 'Groceries', value: -1300_00, href: 'column:Living › Groceries' },
    ]);
  });
  it('opens the folded "Other" series on every column but the ranked ones', () => {
    const columns = Array.from({ length: 9 }, (_, index) => `C${index}`);
    const data = drillable(
      source(['2025-01'], columns, [columns.map((_, index) => -(index + 1) * 100)]),
      'month',
      'category',
    );

    const other = rankedTotals(data, 9).find((item) => item.name === 'Other');

    expect(other).toMatchObject({ group: 'Other', name: 'Other', value: -1700 });
    expect(drillOf(other!.href).cell).toEqual({ column: { except: columns.slice(0, 7) }, page: 1 });
  });
});

describe('shareParts', () => {
  it('gives each part its share of the whole, largest first', () => {
    const parts = shareParts(balances.data!);

    expect(parts.map(({ label, share }) => [label, share])).toEqual([
      ['UBS · Savings', 0.6],
      ['UBS · Current', 0.3],
      ['BCGE · Pillar 3a', 0.1],
    ]);
    expect(parts[0]).toMatchObject({ value: 6000_00, href: 'row:UBS · Savings' });
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

  it('names the chapter each visualisation becomes', () => {
    for (const visualisation of ['table', 'line', 'stacked_bar', 'donut', 'number'] as const) {
      const kind = chapterKind(widget({ visualisation, data: incomeVsExpense.data }));
      expect(STORY_SHOWN_AS[visualisation].full).toContain(kindWords[kind]);
    }
  });

  it('mentions the ranking a stacked bar becomes with many series', () => {
    const manySeries = widget({ visualisation: 'stacked_bar', data: spending.data });
    expect(chapterKind(manySeries)).toBe('ranking');
    expect(STORY_SHOWN_AS.stacked_bar.full).toContain('ranking');
  });
});

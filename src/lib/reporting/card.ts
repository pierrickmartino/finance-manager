import { isTimeAxis, type ReportAxis, type TimeAxis } from '@/server/services/reporting/query';
import type { ReportHeader, Visualisation, WidgetSource } from '@/server/services/reporting';
import { divideRounded } from './average';
import type { Size } from './board';
import { periodSumDrill, toDonutSlices, toSeriesChart, type ChartSource } from './chart-data';
import { averaged, drillUrl } from './drill-link';
import { isDayKey } from './interval-label';
import {
  areasMark,
  asExpense,
  runningFlowSentences,
  type AreasMark,
  type FlowSlots,
} from './line-flow';
import { readNetWorth, type NetWorthLineMark } from './net-worth-card';
import { periodValues, type PeriodValue } from './period-values';

export type { FlowPoint } from './line-flow';
export type { LineMarker, NetWorthBand } from './net-worth-card';
export type { PeriodValue } from './period-values';

/**
 * A Widget's card on the Dashboard Story (GLOSSARY: Card, ADR-0009): what it is before its
 * query has run (`cardFrame`), and what it says and draws once it has (`readCard`). The
 * components only draw a reading. Amounts are minor units, as everywhere in the reporting engine.
 */

/** What a card is read from. */
export interface CardWidget {
  id: string;
  name: string;
  source: WidgetSource;
  visualisation: Visualisation;
  query: CardQuery;
  data: ChartSource | null;
}

/**
 * Of a Widget's query, what its card reads: the row axis, and the column axis. A time axis
 * of rows makes the Account balances Net worth over time; columns by Category group type are
 * how a flow's income and expense columns come, which its placeholder hints at.
 */
export interface CardQuery {
  rows?: ReportAxis | null;
  columns?: ReportAxis | null;
}

/** A Widget as its card draws it: its data, and how its query went. */
export interface WidgetCardData extends CardWidget {
  error: string | null;
  /** Transactions (or Accounts) left out for want of an FX rate. */
  unconvertedCount: number;
}

/**
 * What a card's frame is read from. Of its data only the series (columns) count, so the server
 * and a placeholder can tell a card's kind without the whole chart.
 */
export type CardSource = Pick<CardWidget, 'source' | 'visualisation' | 'query'> & {
  data: Pick<ChartSource, 'columns'> | null;
};

/** How a card shows its Widget. */
export type CardKind =
  'trend' | 'bars' | 'ranking' | 'share' | 'grid' | 'ring' | 'number' | 'netWorthTrend';

/**
 * The quiet mark a placeholder draws: a figure, tick rows, a ring, a grid of cells, bars or
 * two overlapping areas.
 */
export type PlaceholderShape = 'number' | 'ticks' | 'ring' | 'grid' | 'bars' | 'areas';

/** The size a new Widget's card starts at, and the smallest it can be read at. */
export interface CardSizes {
  initial: Size;
  min: Size;
}

/** What a card is before its query has run. */
export interface CardFrame {
  kind: CardKind;
  sizes: CardSizes;
  /** The mark its placeholder hints at. */
  placeholder: PlaceholderShape;
}

/** Above this many series a stacked bar is told as a ranking of its parts. */
const RANKING_FROM_SERIES = 3;

const SIZES = {
  number: { initial: { w: 4, h: 3 }, min: { w: 2, h: 2 } },
  balances: { initial: { w: 4, h: 6 }, min: { w: 3, h: 4 } },
  list: { initial: { w: 4, h: 8 }, min: { w: 3, h: 5 } },
  grid: { initial: { w: 8, h: 8 }, min: { w: 4, h: 5 } },
  chart: { initial: { w: 8, h: 6 }, min: { w: 4, h: 4 } },
  // The chart, then up to six facts: the change, each account kind's share, capital movements.
  netWorth: { initial: { w: 8, h: 9 }, min: { w: 4, h: 9 } },
} as const satisfies Record<string, CardSizes>;

/**
 * Each kind's size and placeholder. The placeholder draws ticks for parts, and bars per period
 * for both trends and bars: whether a bar chart becomes a ranking depends on its series,
 * unknown until the query has run.
 */
const KINDS: Record<CardKind, { sizes: CardSizes; placeholder: PlaceholderShape }> = {
  number: { sizes: SIZES.number, placeholder: 'number' },
  share: { sizes: SIZES.balances, placeholder: 'ticks' },
  ranking: { sizes: SIZES.list, placeholder: 'ticks' },
  ring: { sizes: SIZES.list, placeholder: 'ring' },
  grid: { sizes: SIZES.grid, placeholder: 'grid' },
  trend: { sizes: SIZES.chart, placeholder: 'bars' },
  bars: { sizes: SIZES.chart, placeholder: 'bars' },
  netWorthTrend: { sizes: SIZES.netWorth, placeholder: 'bars' },
};

/** A Widget query's row axis when it is a time axis: what makes balances Net worth over time. */
export function timeAxisOf(query: CardQuery): TimeAxis | null {
  return isTimeAxis(query.rows) ? query.rows : null;
}

function kindOf(widget: CardSource): CardKind {
  // Net worth over time is its own card, whatever the visualisation.
  if (widget.source === 'account_balances' && timeAxisOf(widget.query)) return 'netWorthTrend';
  if (widget.visualisation === 'number') return 'number';
  if (widget.source === 'account_balances') return 'share';
  if (widget.visualisation === 'table') return 'grid';
  if (widget.visualisation === 'donut') return 'ring';
  if (widget.visualisation === 'line') return 'trend';
  return (widget.data?.columns.length ?? 0) >= RANKING_FROM_SERIES ? 'ranking' : 'bars';
}

/**
 * Whether a trend's placeholder hints at a flow's two areas. Whether it is a flow is only known
 * once its totals are (one column positive, one negative), so the hint goes by how a flow's
 * columns come: one per Category group type.
 */
const hintsAtFlow = (kind: CardKind, query: CardQuery): boolean =>
  kind === 'trend' && query.columns === 'categoryGroupType';

/** A card's kind, sizes and placeholder, from its Widget alone (and the series, once known). */
export function cardFrame(widget: CardSource): CardFrame {
  const kind = kindOf(widget);
  const { sizes, placeholder } = KINDS[kind];
  return {
    kind,
    sizes: { initial: { ...sizes.initial }, min: { ...sizes.min } },
    placeholder: hintsAtFlow(kind, widget.query) ? 'areas' : placeholder,
  };
}

/**
 * What each visualisation becomes on the Dashboard Story, for the Widget editor's picker: the
 * Story draws cards, not the five visualisations one for one.
 */
export const STORY_SHOWN_AS: Record<Visualisation, { short: string; full: string }> = {
  table: { short: 'as a heatmap', full: 'In the Story: a heatmap of its rows and columns' },
  line: {
    short: 'as a trend',
    full: 'In the Story: a trend line, or two areas when its columns are income and expense',
  },
  stacked_bar: {
    short: 'as bars',
    full: `In the Story: bars per period, or a ranking from ${RANKING_FROM_SERIES} series`,
  },
  donut: { short: 'as a ring', full: 'In the Story: a ring of its slices, the total inside' },
  number: { short: 'as a number', full: 'In the Story: one large number' },
};

/** One period's money in and out, both as positive amounts. */
export interface MonthFlow {
  label: string;
  /** The period is still running (its numbers will still change). */
  isPartial: boolean;
  income: number;
  expense: number;
  net: number;
}

/** One part a card lists as a row of ticks: its name, its amount and its share of the whole. */
export interface TickItem {
  key: string;
  title: string;
  /** Under the title: the group, the amount. */
  detail: string;
  share: number;
  href: string | null;
}

/** The income and expense of a Widget that holds both, and where its figures drill down. */
export interface CardFlow {
  months: MonthFlow[];
  /** The period each of its rows spans (`month`, `quarter` or `year`), read from the row keys. */
  period: TimeAxis;
  /** All its Transactions: income and expense net to what was kept over the months. */
  href: string;
  /** The latest full month's Transactions (null when every month is still running). */
  latestHref: string | null;
  /** The expense of every full month, subtotalled per month, for the insight's change. */
  changeHref: string | null;
}

/** What a card draws under its sentence. Ring and grid draw from the data itself. */
export type CardMark =
  | { type: 'none' }
  /** No rows: the sentence saying why, as plain text. */
  | { type: 'empty'; sentence: string }
  /** A balances Widget with no Account: an empty chart, the sentence saying why. */
  | { type: 'emptyChart'; sentence: string }
  | { type: 'number'; total: number | null; href: string }
  | { type: 'ticks'; items: TickItem[] }
  | { type: 'ring'; data: ChartSource }
  | { type: 'grid'; data: ChartSource }
  | { type: 'dots'; months: MonthFlow[] }
  /** A line flow: two overlapping areas, income and expense, whose gap is its Profit. */
  | AreasMark
  | { type: 'bars'; periods: PeriodValue[] }
  | NetWorthLineMark;

/**
 * A card's figure. Each links to its Drill-down (GLOSSARY), whose working gives the same
 * figure; null where it has none (Account balances).
 */
export interface CardFact {
  label: string;
  value: string;
  href: string | null;
}

/** Everything a card says and draws. */
export interface CardReading {
  kind: CardKind;
  lead: { headline: string; detail: string; href: string | null } | null;
  facts: CardFact[];
  mark: CardMark;
  /** Its income and expense, when its data holds both, whatever it is drawn as. */
  flow: CardFlow | null;
}

type Money = (minor: number) => string;

/** How many parts a ranking card lists. */
const RANKING_LIMIT = 6;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** The index of the last period that is over, or -1 when every one is still running. */
export function latestFullIndex(rows: Pick<ReportHeader, 'isPartial'>[]): number {
  return rows.findLastIndex((row) => !row.isPartial);
}

/** "Living › Groceries" → ["Living", "Groceries"]; a label without a group is both. */
function splitPath(label: string): [group: string, name: string] {
  const [group, ...rest] = label.split(' › ');
  return rest.length > 0 ? [group!, rest.join(' › ')] : [label, label];
}

/**
 * The income and expense columns, when the source has one positive and one negative column
 * (an income-vs-expense Widget): the one with the larger total is the income, so a refund
 * month in the expense column doesn't turn it into income.
 */
function flowSlotsOf(data: ChartSource): FlowSlots | null {
  if (data.columns.length !== 2) return null;
  const [first, second] = data.columnTotals;
  if (first == null || second == null) return null;
  const incomeSlot = first >= second ? 0 : 1;
  const expenseSlot = 1 - incomeSlot;
  if ((data.columnTotals[incomeSlot] ?? 0) <= 0 || (data.columnTotals[expenseSlot] ?? 0) >= 0) {
    return null;
  }
  return { incomeSlot, expenseSlot };
}

function monthsOf(data: ChartSource, { incomeSlot, expenseSlot }: FlowSlots): MonthFlow[] {
  return data.rows.map((row, r) => {
    const income = data.cells[r]?.[incomeSlot] ?? 0;
    const expense = asExpense(data.cells[r]?.[expenseSlot]);
    return { label: row.label, isPartial: row.isPartial, income, expense, net: income - expense };
  });
}

/** A line flow by day reads as running totals (ADR-0020); by any other Interval, its own. */
const isRunningFlow = (kind: CardKind, data: ChartSource): boolean =>
  kind === 'trend' && periodWords(data).noun === 'day';

/** How a flow is drawn: a line as two areas, bars as dots. */
function flowMark(kind: CardKind, data: ChartSource, slots: FlowSlots): CardMark {
  if (kind !== 'trend') return { type: 'dots', months: monthsOf(data, slots) };
  return areasMark(data, slots, isRunningFlow(kind, data));
}

/**
 * The expense of the full months, with a subtotal per month: what the insight's change is
 * worked out from. Only for a sum whose rows are periods, as the subtotals are per period.
 */
function changeHref(data: ChartSource, expenseSlot: number): string | null {
  const byPeriod = periodSumDrill(data);
  if (!byPeriod) return null;
  const partial = data.rows.filter((row) => row.isPartial).map((row) => row.key);
  return drillUrl(byPeriod.drill, {
    row: { except: partial },
    column: data.columns[expenseSlot]!.key,
    withPeriodSubtotals: true,
  });
}

function flowOf(data: ChartSource, slots: FlowSlots): CardFlow {
  const latest = latestFullIndex(data.rows);
  return {
    months: monthsOf(data, slots),
    period: periodWords(data).noun,
    href: data.hrefs.total,
    latestHref: latest === -1 ? null : (data.hrefs.rowTotals[latest] ?? null),
    changeHref: changeHref(data, slots.expenseSlot),
  };
}

/** Each part of the whole, largest first, with its share (parts are sized by magnitude). */
export function shareParts(
  data: ChartSource,
): { label: string; value: number; share: number; href: string | null }[] {
  const slices = toDonutSlices(data);
  const whole = sum(slices.map((slice) => slice.value));
  return [...slices]
    .sort((a, b) => b.value - a.value)
    .map((slice) => ({
      label: slice.label,
      value: slice.signedValue,
      share: whole === 0 ? 0 : slice.value / whole,
      href: slice.href,
    }));
}

/**
 * Each series' total over the period (e.g. per Category), largest magnitude first, with its
 * drill-down ("Other": every column but the ranked ones).
 */
function rankedTotals(
  data: ChartSource,
  limit: number,
): { group: string; name: string; value: number; href: string | null }[] {
  const chart = toSeriesChart(data);
  return chart.series
    .map((series) => {
      const [group, name] = splitPath(series.label);
      const value = sum(chart.points.map((point) => point.values[series.key] ?? 0));
      return { group, name, value, href: chart.totalHrefs[series.key] ?? null };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

function rankingItems(data: ChartSource, money: Money): TickItem[] {
  const parts = rankedTotals(data, RANKING_LIMIT);
  const whole = Math.abs(data.total ?? 0) || parts.reduce((t, p) => t + Math.abs(p.value), 0);
  return parts.map((part) => ({
    key: `${part.group}/${part.name}`,
    title: part.name,
    detail: part.group === part.name ? money(part.value) : `${part.group} · ${money(part.value)}`,
    share: whole === 0 ? 0 : Math.abs(part.value) / whole,
    href: part.href,
  }));
}

function shareItems(data: ChartSource, money: Money): TickItem[] {
  return shareParts(data).map((part) => ({
    key: part.label,
    title: part.label,
    detail: money(part.value),
    share: part.share,
    href: part.href,
  }));
}

type CardSentences = Pick<CardReading, 'lead' | 'facts'>;

function shareSentences(data: ChartSource, money: Money): CardSentences {
  const parts = shareParts(data);
  const [top] = parts;
  if (!top) return { lead: null, facts: [] };
  // Money in and out together net to a total no part is a share of: name the largest instead.
  if (parts.some((part) => part.value < 0) && parts.some((part) => part.value > 0)) {
    return {
      lead: { headline: `${top.label} leads`, detail: money(top.value), href: top.href },
      facts: [],
    };
  }
  const whole = data.total ?? sum(parts.map((part) => part.value));
  return {
    lead: {
      headline: `${Math.round(top.share * 100)}% sits in ${top.label}`,
      detail: `${money(top.value)} of ${money(whole)}`,
      href: top.href,
    },
    facts: [],
  };
}

/** The words for the period each row stands for, so a yearly Widget doesn't speak of months. */
interface PeriodWords {
  noun: TimeAxis;
  adjective: string;
}

const PERIOD_WORDS = {
  day: { noun: 'day', adjective: 'Daily' },
  month: { noun: 'month', adjective: 'Monthly' },
  quarter: { noun: 'quarter', adjective: 'Quarterly' },
  year: { noun: 'year', adjective: 'Yearly' },
} as const satisfies Record<TimeAxis, PeriodWords>;

/** What an average reads when there is nothing to average (GLOSSARY: Period, ADR-0016). */
const NO_AVERAGE = '—';

/**
 * The average of the complete periods' totals, rounded as the engine rounds, and its
 * Drill-down: the complete periods as an average per row period. A period still running or cut
 * short is left out, as it would drag the average down; with no complete period there is no
 * average (null), never one of nothing. The link is there only where the Drill-down works out
 * that same number: a sum whose rows are those periods.
 */
function periodAverage(
  data: ChartSource,
  period: TimeAxis,
): { value: number | null; href: string | null } {
  const partial = data.rows.filter((row) => row.isPartial).map((row) => row.key);
  if (partial.length === data.rows.length) return { value: null, href: null };
  const counted = data.rows.flatMap((row, r) => (row.isPartial ? [] : [data.rowTotals[r] ?? 0]));
  const value = divideRounded(sum(counted), counted.length);
  const byPeriod = periodSumDrill(data);
  const isAverageOfRange = byPeriod?.period === period;
  const cell = partial.length > 0 ? { row: { except: partial } } : {};
  return {
    value,
    href: byPeriod && isAverageOfRange ? drillUrl(averaged(byPeriod.drill, period), cell) : null,
  };
}

/** An average as a card states it: "—" when there is none. */
const averageText = (value: number | null, money: Money): string =>
  value === null ? NO_AVERAGE : money(value);

/**
 * The period of the rows, read from their keys (`2025`, `2025-Q1`, `2025-03`, `2025-03-14`);
 * months by default.
 */
function periodWords(data: ChartSource): PeriodWords {
  const keys = data.rows.map((row) => row.key).filter((key): key is string => key !== null);
  if (keys.length === 0) return PERIOD_WORDS.month;
  if (keys.every((key) => /^\d{4}$/.test(key))) return PERIOD_WORDS.year;
  if (keys.every((key) => /^\d{4}-Q[1-4]$/.test(key))) return PERIOD_WORDS.quarter;
  if (keys.every(isDayKey)) return PERIOD_WORDS.day;
  return PERIOD_WORDS.month;
}

/** Income vs. expense: the biggest period in, the biggest period out, and what stayed. */
function flowSentences(
  data: ChartSource,
  { incomeSlot, expenseSlot }: FlowSlots,
  money: Money,
): CardSentences {
  const { noun } = periodWords(data);
  const chart = toSeriesChart(data);
  const income = data.rows.map((_, r) => data.cells[r]?.[incomeSlot] ?? 0);
  const expense = data.rows.map((_, r) => asExpense(data.cells[r]?.[expenseSlot]));
  const most = (values: number[]) => values.indexOf(Math.max(...values));
  const [inMost, outMost] = [most(income), most(expense)];
  const month = (index: number) => chart.points[index]!.label;
  const cellHref = (r: number, slot: number) => data.hrefs.cells[r]?.[slot] ?? null;
  // Income and expense together net to what was kept: the rows' totals.
  const kept = periodAverage(data, noun);
  return {
    lead: {
      headline: `Most came in: ${month(inMost)}`,
      detail: money(income[inMost]!),
      href: cellHref(inMost, incomeSlot),
    },
    facts: [
      {
        label: `Most went out: ${month(outMost)}`,
        value: money(expense[outMost]!),
        href: cellHref(outMost, expenseSlot),
      },
      {
        label: `Kept per ${noun}, on average`,
        value: averageText(kept.value, money),
        href: kept.href,
      },
    ],
  };
}

/** Period by period: the best and weakest (or, for spending, heaviest and lightest) periods. */
function periodSentences(kind: CardKind, data: ChartSource, money: Money): CardSentences {
  const { noun, adjective } = periodWords(data);
  const chart = toSeriesChart(data);
  // The rows' own totals, as their Drill-downs add up (summing cells counts a Tag twice).
  const totals = data.rows.map((_, r) => data.rowTotals[r] ?? 0);
  const isSpending = totals.every((value) => value <= 0);
  // Spending is negative: rank by magnitude so "heaviest" means the most spent.
  const ranked = isSpending ? totals.map(Math.abs) : totals;
  const top = ranked.indexOf(Math.max(...ranked));
  // A period with no spending at all has no data yet; it isn't the lightest one.
  const candidates = isSpending ? ranked.filter((value) => value > 0) : ranked;
  const low = ranked.indexOf(Math.min(...(candidates.length > 0 ? candidates : ranked)));
  const [topLabel, lowLabel] = isSpending
    ? [`Heaviest ${noun}`, `Lightest ${noun}`]
    : [`Best net ${noun}`, `Weakest ${noun}`];
  const average = periodAverage(data, noun);
  const period = (index: number, label: string): CardFact => ({
    label: `${label}: ${chart.points[index]!.label}`,
    value: money(totals[index]!),
    href: data.hrefs.rowTotals[index] ?? null,
  });
  const peak = period(top, topLabel);
  const facts = [
    period(low, lowLabel),
    { label: `${adjective} average`, value: averageText(average.value, money), href: average.href },
  ];

  if (kind === 'ranking') {
    const [leader] = rankedTotals(data, 1);
    return {
      lead: { headline: `${leader!.name} leads`, detail: money(leader!.value), href: leader!.href },
      facts: [peak, ...facts],
    };
  }
  return { lead: { headline: peak.label, detail: peak.value, href: peak.href }, facts };
}

/** What a card with rows says and draws; a flow is told as one whether bars or a line. */
function readRows(
  kind: CardKind,
  data: ChartSource,
  slots: FlowSlots | null,
  money: Money,
  axis: TimeAxis | null,
): Pick<CardReading, 'lead' | 'facts' | 'mark'> {
  const silent = { lead: null, facts: [] };
  switch (kind) {
    case 'number':
      return { ...silent, mark: { type: 'number', total: data.total, href: data.hrefs.total } };
    case 'share':
      return {
        ...shareSentences(data, money),
        mark: { type: 'ticks', items: shareItems(data, money) },
      };
    case 'ring':
      return { ...shareSentences(data, money), mark: { type: 'ring', data } };
    // A grid's headline is its largest row, as a share's: the heatmap shows the rest.
    case 'grid':
      return { ...shareSentences(data, money), mark: { type: 'grid', data } };
    case 'ranking':
      return {
        ...periodSentences(kind, data, money),
        mark: { type: 'ticks', items: rankingItems(data, money) },
      };
    case 'netWorthTrend':
      return readNetWorth(data, axis, money);
    case 'trend':
    case 'bars':
      return slots
        ? {
            ...(isRunningFlow(kind, data)
              ? runningFlowSentences(data, slots, money)
              : flowSentences(data, slots, money)),
            mark: flowMark(kind, data, slots),
          }
        : {
            ...periodSentences(kind, data, money),
            mark: { type: 'bars', periods: periodValues(data) },
          };
  }
}

/**
 * What a card with no rows draws. A balances Widget always has a row (or a point) for each
 * Account it counts, so with none its filters leave no Account: an empty chart says so. A
 * query's range simply holds nothing yet.
 */
function emptyMark(widget: CardWidget): CardMark {
  return widget.source === 'account_balances'
    ? { type: 'emptyChart', sentence: "No Account matches this Widget's filters." }
    : { type: 'empty', sentence: 'No data in this date range yet.' };
}

/** What a Widget's card says about it in plain language, and the mark it draws. */
export function readCard(widget: CardWidget, money: Money): CardReading {
  const { kind } = cardFrame(widget);
  const { data } = widget;
  if (!data) return { kind, lead: null, facts: [], mark: { type: 'none' }, flow: null };
  const slots = flowSlotsOf(data);
  const flow = slots ? flowOf(data, slots) : null;
  if (data.rows.length === 0) {
    return { kind, lead: null, facts: [], mark: emptyMark(widget), flow };
  }
  return { kind, ...readRows(kind, data, slots, money, timeAxisOf(widget.query)), flow };
}

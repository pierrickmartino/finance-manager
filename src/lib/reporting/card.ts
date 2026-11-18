import { isTimeAxis, type ReportAxis, type TimeAxis } from '@/server/services/reporting/query';
import type { ReportHeader, Visualisation, WidgetSource } from '@/server/services/reporting';
import { divideRounded } from './average';
import type { Size } from './board';
import { periodKey, periodSpan } from '@/server/services/reporting/periods';
import {
  periodSumDrill,
  toDonutSlices,
  toSeriesChart,
  type ChartMarker,
  type ChartSource,
} from './chart-data';
import { averaged, drillUrl } from './drill-link';

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
  /** The Widget query's row axis when it is a time axis (`timeAxisOf`), else null. */
  timeAxis: TimeAxis | null;
  data: ChartSource | null;
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
export type CardSource = Pick<CardWidget, 'source' | 'visualisation' | 'timeAxis'> & {
  data: Pick<ChartSource, 'columns'> | null;
};

/** How a card shows its Widget. */
export type CardKind =
  'trend' | 'bars' | 'ranking' | 'share' | 'grid' | 'ring' | 'number' | 'netWorthTrend';

/** The quiet mark a placeholder draws: a figure, tick rows, a ring, a grid of cells or bars. */
export type PlaceholderShape = 'number' | 'ticks' | 'ring' | 'grid' | 'bars';

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
  netWorthTrend: { sizes: SIZES.chart, placeholder: 'bars' },
};

/** A Widget query's row axis when it is a time axis: what makes balances Net worth over time. */
export function timeAxisOf(query: { rows: ReportAxis | null }): TimeAxis | null {
  return isTimeAxis(query.rows) ? query.rows : null;
}

function kindOf(widget: CardSource): CardKind {
  // Net worth over time is its own card, whatever the visualisation.
  if (widget.source === 'account_balances' && widget.timeAxis) return 'netWorthTrend';
  if (widget.visualisation === 'number') return 'number';
  if (widget.source === 'account_balances') return 'share';
  if (widget.visualisation === 'table') return 'grid';
  if (widget.visualisation === 'donut') return 'ring';
  if (widget.visualisation === 'line') return 'trend';
  return (widget.data?.columns.length ?? 0) >= RANKING_FROM_SERIES ? 'ranking' : 'bars';
}

/** A card's kind, sizes and placeholder, from its Widget alone (and the series, once known). */
export function cardFrame(widget: CardSource): CardFrame {
  const kind = kindOf(widget);
  const { sizes, placeholder } = KINDS[kind];
  return {
    kind,
    sizes: { initial: { ...sizes.initial }, min: { ...sizes.min } },
    placeholder,
  };
}

/**
 * What each visualisation becomes on the Dashboard Story, for the Widget editor's picker: the
 * Story draws cards, not the five visualisations one for one.
 */
export const STORY_SHOWN_AS: Record<Visualisation, { short: string; full: string }> = {
  table: { short: 'as a heatmap', full: 'In the Story: a heatmap of its rows and columns' },
  line: { short: 'as a trend', full: 'In the Story: a trend line' },
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

/** One period's total and where it drills down to. */
export interface PeriodValue {
  label: string;
  value: number;
  href: string;
  isPartial: boolean;
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
  /** An empty chart, and the sentence saying why it is empty. */
  | { type: 'empty'; sentence: string }
  | { type: 'number'; total: number | null; href: string }
  | { type: 'ticks'; items: TickItem[] }
  | { type: 'ring'; data: ChartSource }
  | { type: 'grid'; data: ChartSource }
  | { type: 'dots'; months: MonthFlow[] }
  | { type: 'bars'; periods: PeriodValue[] }
  | {
      type: 'netWorthLine';
      points: PeriodValue[];
      bands: NetWorthBand[];
      markers?: LineMarker[];
    };

/** A Capital movement drawn on the Net worth line. */
export interface LineMarker {
  /** Where on the line, in points: 1.5 is halfway from the second point to the third. */
  at: number;
  date: string;
  /** Its Payee (or Category) and CHF amount. */
  title: string;
  /** Its Transaction detail. */
  href: string;
}

/** One Account kind's band under the Net worth line: its value at each point (loans below zero). */
export interface NetWorthBand {
  key: string;
  label: string;
  points: PeriodValue[];
}

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

/** Which column holds the income and which the expense. */
interface FlowSlots {
  incomeSlot: number;
  expenseSlot: number;
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
    const expense = 0 - (data.cells[r]?.[expenseSlot] ?? 0);
    return { label: row.label, isPartial: row.isPartial, income, expense, net: income - expense };
  });
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

/** Each row's total (a period, for a trend or bars Widget), with its drill-down link. */
function periodValues(data: ChartSource): PeriodValue[] {
  return data.rows.map((row, r) => ({
    label: row.label,
    value: data.rowTotals[r] ?? 0,
    href: data.hrefs.rowTotals[r] ?? data.hrefs.total,
    isPartial: row.isPartial,
  }));
}

type CardSentences = Pick<CardReading, 'lead' | 'facts'>;

function shareSentences(data: ChartSource, money: Money): CardSentences {
  const parts = shareParts(data);
  const [top] = parts;
  if (!top) return { lead: null, facts: [] };
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
  month: { noun: 'month', adjective: 'Monthly' },
  quarter: { noun: 'quarter', adjective: 'Quarterly' },
  year: { noun: 'year', adjective: 'Yearly' },
} as const satisfies Record<TimeAxis, PeriodWords>;

/**
 * The average of the row totals over the rows, rounded as the engine rounds, and its
 * Drill-down: the whole range as an average per row period. The link is there only where the
 * Drill-down works out that same number: a sum whose rows are those periods.
 */
function periodAverage(
  data: ChartSource,
  period: TimeAxis,
): { value: number; href: string | null } {
  const value = divideRounded(sum(data.rowTotals.map((total) => total ?? 0)), data.rows.length);
  const byPeriod = periodSumDrill(data);
  const isAverageOfRange = byPeriod?.period === period;
  return {
    value,
    href: byPeriod && isAverageOfRange ? drillUrl(averaged(byPeriod.drill, period), {}) : null,
  };
}

/** The period of the rows, read from their keys (`2025`, `2025-Q1`, `2025-03`); months by default. */
function periodWords(data: ChartSource): PeriodWords {
  const keys = data.rows.map((row) => row.key).filter((key): key is string => key !== null);
  if (keys.length === 0) return PERIOD_WORDS.month;
  if (keys.every((key) => /^\d{4}$/.test(key))) return PERIOD_WORDS.year;
  if (keys.every((key) => /^\d{4}-Q[1-4]$/.test(key))) return PERIOD_WORDS.quarter;
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
  const expense = data.rows.map((_, r) => -(data.cells[r]?.[expenseSlot] ?? 0));
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
      { label: `Kept per ${noun}, on average`, value: money(kept.value), href: kept.href },
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
    { label: `${adjective} average`, value: money(average.value), href: average.href },
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

/**
 * Net worth over time: where it stood at the latest point and how far it moved since the first,
 * every figure opening the Accounts as of its date.
 */
/** Each Account kind's band: its value per period, each linking to that kind's Accounts then. */
function netWorthBands(data: ChartSource): NetWorthBand[] {
  return data.columns.map((column, c) => ({
    key: column.key ?? '',
    label: column.label,
    points: data.rows.map((row, r) => ({
      label: row.label,
      value: data.cells[r]?.[c] ?? 0,
      href: data.hrefs.cells[r]?.[c] ?? data.hrefs.rowTotals[r] ?? data.hrefs.total,
      isPartial: row.isPartial,
    })),
  }));
}

/**
 * Each Account kind's share at the latest point, sized by magnitude as the balances share card
 * sizes its parts (so a loan's share is of everything held or owed); a kind at zero is left out.
 */
function kindShareFacts(bands: NetWorthBand[], money: Money): CardFact[] {
  const latest = bands.flatMap((band) => {
    const point = band.points.at(-1);
    return point && point.value !== 0 ? [{ label: band.label, point }] : [];
  });
  const whole = sum(latest.map(({ point }) => Math.abs(point.value)));
  return latest.map(({ label, point }) => {
    const share = Math.round((Math.abs(point.value) / whole) * 100);
    return { label, value: `${money(point.value)} · ${share}%`, href: point.href };
  });
}

function netWorthSentences(points: PeriodValue[], money: Money): CardSentences {
  const first = points[0]!;
  const latest = points.at(-1)!;
  const change = latest.value - first.value;
  const range = first === latest ? latest.label : `${first.label} – ${latest.label}`;
  const movement =
    change === 0 ? 'unchanged' : `${change > 0 ? 'up' : 'down'} ${money(Math.abs(change))}`;
  const standing = latest.isPartial
    ? `Net worth is ${money(latest.value)} so far in ${latest.label}`
    : `Net worth was ${money(latest.value)} at the end of ${latest.label}`;
  return {
    lead: {
      headline: `${standing}, ${movement} over ${range}.`,
      detail: money(latest.value),
      href: latest.href,
    },
    facts: [
      {
        label: `Change over ${range}`,
        value: `${change > 0 ? '+' : ''}${money(change)}`,
        href: latest.href,
      },
    ],
  };
}

/** How many Capital movements the range holds. No Drill-down: the markers open each one. */
function capitalFact(markers: readonly ChartMarker[]): CardFact {
  return { label: 'Capital movements', value: String(markers.length), href: null };
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * Each Capital movement on the line at its date: points stand at their period's last day, so
 * a movement is that far through its period past the previous point (never before the first).
 */
function lineMarkers(
  rows: ReportHeader[],
  markers: readonly ChartMarker[],
  axis: TimeAxis,
  money: Money,
): LineMarker[] {
  return markers.flatMap((marker) => {
    const index = rows.findIndex((row) => row.key === periodKey(marker.date, axis));
    if (index < 0) return [];
    const period = periodSpan(rows[index]!.key!, axis);
    const start = dayNumber(period.from);
    const through = (dayNumber(marker.date) - start + 1) / (dayNumber(period.to) - start + 1);
    return [
      {
        at: Math.max(0, index - 1 + through),
        date: marker.date,
        title:
          marker.amountMinor === null
            ? marker.label
            : `${marker.label}: ${money(marker.amountMinor)}`,
        href: marker.href,
      },
    ];
  });
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
    case 'netWorthTrend': {
      const points = periodValues(data);
      const bands = netWorthBands(data);
      const { lead, facts } = netWorthSentences(points, money);
      const kindFacts = kindShareFacts(bands, money);
      if (!data.markers || !axis) {
        return {
          lead,
          facts: [...facts, ...kindFacts],
          mark: { type: 'netWorthLine', points, bands },
        };
      }
      return {
        lead,
        facts: [...facts, ...kindFacts, capitalFact(data.markers)],
        mark: {
          type: 'netWorthLine',
          points,
          bands,
          markers: lineMarkers(data.rows, data.markers, axis, money),
        },
      };
    }
    case 'trend':
    case 'bars':
      return slots
        ? {
            ...flowSentences(data, slots, money),
            mark: { type: 'dots', months: monthsOf(data, slots) },
          }
        : {
            ...periodSentences(kind, data, money),
            mark: { type: 'bars', periods: periodValues(data) },
          };
  }
}

/**
 * Why a card has no rows. A balances Widget always has a row (or a point) for each Account it
 * counts, so with none its filters leave no Account.
 */
function emptySentence(widget: CardWidget): string {
  return widget.source === 'account_balances'
    ? "No Account matches this Widget's filters."
    : 'No data in this date range yet.';
}

/** What a Widget's card says about it in plain language, and the mark it draws. */
export function readCard(widget: CardWidget, money: Money): CardReading {
  const { kind } = cardFrame(widget);
  const { data } = widget;
  if (!data) return { kind, lead: null, facts: [], mark: { type: 'none' }, flow: null };
  const slots = flowSlotsOf(data);
  const flow = slots ? flowOf(data, slots) : null;
  if (data.rows.length === 0) {
    return {
      kind,
      lead: null,
      facts: [],
      mark: { type: 'empty', sentence: emptySentence(widget) },
      flow,
    };
  }
  return { kind, ...readRows(kind, data, slots, money, widget.timeAxis), flow };
}

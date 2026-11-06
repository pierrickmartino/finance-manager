import type { Visualisation, WidgetSource } from '@/server/services/reporting';
import { toDonutSlices, toSeriesChart, type ChartSource } from './chart-data';

/**
 * The Dashboard Story: a Dashboard told top to bottom, one chapter per Widget, under a hero
 * number. These functions decide what each chapter says; the components only draw it.
 * Amounts are minor units, as everywhere in the reporting engine.
 */
export interface StoryWidget {
  id: string;
  name: string;
  source: WidgetSource;
  visualisation: Visualisation;
  data: ChartSource | null;
}

/** How a chapter shows its Widget. */
export type ChapterKind = 'trend' | 'bars' | 'ranking' | 'share' | 'number';

/** Above this many series a stacked bar is told as a ranking of its parts. */
const RANKING_FROM_SERIES = 3;

export interface StoryHero {
  label: string;
  value: number;
  href: string;
  /** The year in and out, when the Dashboard has an income-vs-expense Widget. */
  flow: { income: number; expense: number; keptShare: number } | null;
}

export interface ChapterStory {
  lead: { headline: string; detail: string } | null;
  facts: { label: string; value: string }[];
}

type Money = (minor: number) => string;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** "Living › Groceries" → ["Living", "Groceries"]; a label without a group is both. */
function splitPath(label: string): [group: string, name: string] {
  const [group, ...rest] = label.split(' › ');
  return rest.length > 0 ? [group!, rest.join(' › ')] : [label, label];
}

/** Income and expense totals, when the source has one positive and one negative column. */
function incomeAndExpense(data: ChartSource): { income: number; expense: number } | null {
  if (data.columns.length !== 2) return null;
  const [a, b] = data.columnTotals;
  if (a == null || b == null) return null;
  const income = Math.max(a, b);
  const expense = Math.min(a, b);
  if (income <= 0 || expense >= 0) return null;
  return { income, expense: -expense };
}

/** The share of income kept (income minus expense, over income), or null. */
export function savingsRate(data: ChartSource): number | null {
  const flow = incomeAndExpense(data);
  return flow ? (flow.income - flow.expense) / flow.income : null;
}

/**
 * The opening number: net worth from the Account balances when the Dashboard has them, else
 * the first Widget total. The year in and out comes from an income-vs-expense Widget.
 */
export function storyHero(widgets: StoryWidget[]): StoryHero | null {
  const balances = widgets.find(
    (widget) => widget.source === 'account_balances' && widget.data?.total != null,
  );
  const lead = balances ?? widgets.find((widget) => widget.data?.total != null);
  if (!lead?.data || lead.data.total == null) return null;

  const flowData = widgets
    .map((widget) => widget.data)
    .find((data) => data !== null && incomeAndExpense(data) !== null);
  const flow = flowData ? incomeAndExpense(flowData) : null;
  return {
    label: balances ? 'Your net worth today' : lead.name,
    value: lead.data.total,
    href: lead.data.hrefs.total,
    flow: flow ? { ...flow, keptShare: (flow.income - flow.expense) / flow.income } : null,
  };
}

export function chapterKind(widget: StoryWidget): ChapterKind {
  if (widget.visualisation === 'number') return 'number';
  if (
    widget.source === 'account_balances' ||
    widget.visualisation === 'table' ||
    widget.visualisation === 'donut'
  )
    return 'share';
  if (widget.visualisation === 'line') return 'trend';
  return (widget.data?.columns.length ?? 0) >= RANKING_FROM_SERIES ? 'ranking' : 'bars';
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
 * drill-down. The folded "Other" series links nowhere.
 */
export function rankedTotals(
  data: ChartSource,
  limit: number,
): { group: string; name: string; value: number; href: string | null }[] {
  const chart = toSeriesChart(data);
  return chart.series
    .map((series) => {
      const [group, name] = splitPath(series.label);
      const value = sum(chart.points.map((point) => point.values[series.key] ?? 0));
      const isFolded =
        chart.series.length < data.columns.length && series.slot === chart.series.length - 1;
      const href = isFolded ? null : (data.hrefs.columnTotals[series.slot] ?? null);
      return { group, name, value, href };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

function shareStory(data: ChartSource, money: Money): ChapterStory {
  const [top] = shareParts(data);
  if (!top) return { lead: null, facts: [] };
  const whole = data.total ?? sum(shareParts(data).map((part) => part.value));
  return {
    lead: {
      headline: `${Math.round(top.share * 100)}% sits in ${top.label}`,
      detail: `${money(top.value)} of ${money(whole)}`,
    },
    facts: [],
  };
}

/** Income vs. expense: the biggest month in, the biggest month out, and what stayed. */
function flowStory(data: ChartSource, money: Money): ChapterStory {
  const chart = toSeriesChart(data);
  const columnOf = (sign: 1 | -1) =>
    chart.series.find((series) =>
      chart.points.some((point) => sign * (point.values[series.key] ?? 0) > 0),
    )!.key;
  const [incomeKey, expenseKey] = [columnOf(1), columnOf(-1)];
  const income = chart.points.map((point) => point.values[incomeKey] ?? 0);
  const expense = chart.points.map((point) => -(point.values[expenseKey] ?? 0));
  const most = (values: number[]) => values.indexOf(Math.max(...values));
  const month = (index: number) => chart.points[index]!.label;
  const kept = Math.round((sum(income) - sum(expense)) / chart.points.length);
  return {
    lead: {
      headline: `Most came in: ${month(most(income))}`,
      detail: money(income[most(income)]!),
    },
    facts: [
      { label: `Most went out: ${month(most(expense))}`, value: money(expense[most(expense)]!) },
      { label: 'Kept per month, on average', value: money(kept) },
    ],
  };
}

/** Month by month: the best and weakest (or, for spending, heaviest and lightest) months. */
function periodStory(widget: StoryWidget, data: ChartSource, money: Money): ChapterStory {
  const chart = toSeriesChart(data);
  const totals = chart.points.map((point) =>
    sum(Object.values(point.values).map((value) => value ?? 0)),
  );
  const isSpending = totals.every((value) => value <= 0);
  // Spending is negative: rank by magnitude so "heaviest" means the most spent.
  const ranked = isSpending ? totals.map(Math.abs) : totals;
  const top = ranked.indexOf(Math.max(...ranked));
  // A month with no spending at all has no data yet; it isn't the lightest month.
  const candidates = isSpending ? ranked.filter((value) => value > 0) : ranked;
  const low = ranked.indexOf(Math.min(...(candidates.length > 0 ? candidates : ranked)));
  const [topLabel, lowLabel] = isSpending
    ? ['Heaviest month', 'Lightest month']
    : ['Best net month', 'Weakest month'];
  const average = Math.round(sum(totals) / totals.length);
  const month = (index: number) => chart.points[index]!.label;
  const peak = { label: `${topLabel}: ${month(top)}`, value: money(totals[top]!) };
  const facts = [
    { label: `${lowLabel}: ${month(low)}`, value: money(totals[low]!) },
    { label: 'Monthly average', value: money(average) },
  ];

  if (chapterKind(widget) === 'ranking') {
    const [leader] = rankedTotals(data, 1);
    return {
      lead: { headline: `${leader!.name} leads`, detail: money(leader!.value) },
      facts: [peak, ...facts],
    };
  }
  return { lead: { headline: peak.label, detail: peak.value }, facts };
}

/** What a chapter says about its Widget, in plain language; the chart shows the rest. */
export function chapterStory(widget: StoryWidget, money: Money): ChapterStory {
  const data = widget.data;
  if (!data || data.rows.length === 0) return { lead: null, facts: [] };
  const kind = chapterKind(widget);
  if (kind === 'number') return { lead: null, facts: [] };
  if (kind === 'share') return shareStory(data, money);
  if (kind === 'bars' && incomeAndExpense(data)) return flowStory(data, money);
  return periodStory(widget, data, money);
}

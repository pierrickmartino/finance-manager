/**
 * PROTOTYPE (throwaway): dashboard redesign, inspired by a reference screenshot.
 * Three variants on the existing `/dashboards/[id]` route, switchable via `?variant=`.
 * Not production code: no tests, minimal guards. See ./README.md.
 *
 * Derives the few numbers every variant needs from the Story chapters already loaded by the
 * page, so the variants stay pure renderers over real data.
 */
import { toSeriesChart, type ChartSource } from '@/lib/reporting/chart-data';
import { chapterKind, rankedTotals, shareParts, storyHero } from '@/lib/reporting/story';
import type { StoryChapter } from '../story/chapter';

export interface RecentActivity {
  id: string;
  name: string;
  detail: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
}

export interface FlowMonth {
  key: string;
  label: string;
  income: number;
  /** Positive: what went out. */
  expense: number;
  net: number;
  /** Spending per Category this month, largest first (positive amounts). */
  categories: { name: string; group: string; value: number }[];
}

export interface DashboardFigures {
  netWorth: { value: number; href: string; label: string } | null;
  months: FlowMonth[];
  /** Spending per Category over the whole range, largest first (positive amounts). */
  spending: { name: string; group: string; value: number; href: string | null }[];
  accounts: { label: string; value: number; share: number; href: string | null }[];
  transactionsHref: string | null;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function splitPath(label: string): [string, string] {
  const [group, ...rest] = label.split(' › ');
  return rest.length > 0 ? [group!, rest.join(' › ')] : [label, label];
}

function isFlow(data: ChartSource): boolean {
  if (data.columns.length !== 2) return false;
  const [a, b] = data.columnTotals;
  return a != null && b != null && Math.max(a, b) > 0 && Math.min(a, b) < 0;
}

function categoriesByMonth(data: ChartSource | null): Map<string, FlowMonth['categories']> {
  const byMonth = new Map<string, FlowMonth['categories']>();
  if (!data) return byMonth;
  const chart = toSeriesChart(data);
  chart.points.forEach((point) => {
    const parts = chart.series
      .map((series) => {
        const [group, name] = splitPath(series.label);
        return { name, group, value: -(point.values[series.key] ?? 0) };
      })
      .filter((part) => part.value > 0)
      .sort((a, b) => b.value - a.value);
    byMonth.set(point.label, parts);
  });
  return byMonth;
}

export function deriveFigures(chapters: StoryChapter[]): DashboardFigures {
  const hero = storyHero(chapters);
  const flow = chapters.find((chapter) => chapter.data && isFlow(chapter.data));
  const spendingChapter = chapters.find(
    (chapter) =>
      chapter.data &&
      chapter !== flow &&
      chapterKind(chapter) === 'ranking' &&
      chapter.data.columnTotals.every((value) => value == null || value <= 0),
  );
  const balances = chapters.find((chapter) => chapter.source === 'account_balances');
  const byMonth = categoriesByMonth(spendingChapter?.data ?? null);

  let months: FlowMonth[] = [];
  if (flow?.data) {
    const chart = toSeriesChart(flow.data);
    const incomeKey = chart.series.find((series) =>
      chart.points.some((point) => (point.values[series.key] ?? 0) > 0),
    )!.key;
    const expenseKey = chart.series.find((series) => series.key !== incomeKey)!.key;
    months = chart.points.map((point, index) => {
      const income = point.values[incomeKey] ?? 0;
      const expense = -(point.values[expenseKey] ?? 0);
      return {
        key: flow.data!.rows[index]?.key ?? point.label,
        label: point.label,
        income,
        expense,
        net: income - expense,
        categories: byMonth.get(point.label) ?? [],
      };
    });
  }

  return {
    netWorth: hero ? { value: hero.value, href: hero.href, label: hero.label } : null,
    months,
    spending: spendingChapter?.data
      ? rankedTotals(spendingChapter.data, 8).map((part) => ({ ...part, value: -part.value }))
      : [],
    accounts: balances?.data ? shareParts(balances.data) : [],
    transactionsHref: flow?.data?.hrefs.total ?? null,
  };
}

/** Change from the previous month to the latest complete one, as a share (null: no basis). */
export function monthOverMonth(months: FlowMonth[], pick: (month: FlowMonth) => number) {
  // The last row is often the current, partial month: compare the two before it when we can.
  const complete = months.filter((month) => !month.label.includes('(partial)'));
  const [previous, latest] = complete.slice(-2);
  if (!previous || !latest || pick(previous) === 0) return null;
  return {
    latest,
    previous,
    change: (pick(latest) - pick(previous)) / Math.abs(pick(previous)),
  };
}

/** A one-line plain-language insight, the screenshot's "Revenue is accelerating." card. */
export function headlineInsight(months: FlowMonth[]): { title: string; body: string } | null {
  const income = monthOverMonth(months, (month) => month.income);
  const expense = monthOverMonth(months, (month) => month.expense);
  if (!income || !expense) return null;
  const pct = (share: number) => `${Math.abs(Math.round(share * 1000) / 10)}%`;
  const verb = (share: number) => (share >= 0 ? 'rose' : 'fell');
  const title =
    expense.change < 0 && income.change >= 0
      ? 'You are pulling ahead.'
      : expense.change < 0
        ? 'Spending is easing.'
        : income.change > expense.change
          ? 'Income is outpacing spending.'
          : 'Spending is climbing.';
  return {
    title,
    body: `In ${income.latest.label}, income ${verb(income.change)} ${pct(income.change)} while spending ${verb(expense.change)} ${pct(expense.change)} compared with ${income.previous.label}.`,
  };
}

export const totalOf = (months: FlowMonth[], pick: (month: FlowMonth) => number) =>
  sum(months.map(pick));

/** "CHF 12'400" → "12.4k" for axes and tight spots. */
export function compact(minor: number): string {
  const value = minor / 100;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(value)}`;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

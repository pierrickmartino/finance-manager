/**
 * PROTOTYPE — throwaway. Finds the Widgets the B and C variants give a fixed slot (by what they
 * hold, not by name) and turns them into the series those slots draw. Amounts in minor units.
 */
import type { ChartSource } from '@/lib/reporting/chart-data';
import { chapterKind, rankedTotals, shareParts } from '@/lib/reporting/story';
import type { StoryChapter } from './story/chapter';

export interface MonthFlow {
  label: string;
  isPartial: boolean;
  income: number;
  expense: number;
  net: number;
}

export interface Derived {
  netWorth: { value: number; href: string; accounts: { label: string; value: number }[] } | null;
  /** Month by month in and out, from an income-vs-expense Widget. */
  flow: { months: MonthFlow[]; href: string; widgetId: string } | null;
  /** Net per month from a one-series trend Widget (falls back to the flow's net). */
  net: { months: { label: string; value: number }[]; href: string; widgetId: string | null } | null;
  spending: {
    total: number;
    parts: { group: string; name: string; value: number; share: number; href: string | null }[];
    widgetId: string;
  } | null;
  insight: { headline: string; detail: string } | null;
  /** The Widgets no slot took. */
  rest: StoryChapter[];
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function flowMonths(data: ChartSource): MonthFlow[] | null {
  if (data.columns.length !== 2) return null;
  const [a, b] = data.columnTotals;
  if (a == null || b == null) return null;
  const incomeSlot = a > b ? 0 : 1;
  if ((data.columnTotals[incomeSlot] ?? 0) <= 0 || (data.columnTotals[1 - incomeSlot] ?? 0) >= 0)
    return null;
  return data.rows.map((row, r) => {
    const income = data.cells[r]?.[incomeSlot] ?? 0;
    const expense = -(data.cells[r]?.[1 - incomeSlot] ?? 0);
    return { label: row.label, isPartial: row.isPartial, income, expense, net: income - expense };
  });
}

function percent(share: number): string {
  return `${Math.round(Math.abs(share) * 100)}%`;
}

function insightFrom(months: MonthFlow[]): Derived['insight'] {
  const full = months.filter((month) => !month.isPartial);
  const last = full.at(-1);
  if (!last || full.length < 2) return null;
  const earlier = full.slice(0, -1);
  const avgExpense = sum(earlier.map((month) => month.expense)) / earlier.length;
  const income = sum(full.map((month) => month.income));
  const kept = income === 0 ? 0 : (income - sum(full.map((month) => month.expense))) / income;
  const change = avgExpense === 0 ? 0 : (last.expense - avgExpense) / avgExpense;
  const isEasing = change <= 0;
  return {
    headline: isEasing ? 'Spending is easing.' : 'Spending is running high.',
    detail: `${last.label} came in ${percent(change)} ${isEasing ? 'below' : 'above'} your monthly average, and you kept ${percent(kept)} of everything that came in.`,
  };
}

export function derive(chapters: StoryChapter[]): Derived {
  const used = new Set<string>();
  const withData = chapters.filter((chapter) => chapter.data && chapter.data.rows.length > 0);

  const balances = withData.find((c) => c.source === 'account_balances' && c.data!.total != null);
  if (balances) used.add(balances.id);
  const netWorth = balances
    ? {
        value: balances.data!.total!,
        href: balances.data!.hrefs.total,
        accounts: shareParts(balances.data!).map((part) => ({
          label: part.label,
          value: part.value,
        })),
      }
    : null;

  const flowChapter = withData.find((c) => flowMonths(c.data!) !== null);
  if (flowChapter) used.add(flowChapter.id);
  const flow = flowChapter
    ? {
        months: flowMonths(flowChapter.data!)!,
        href: flowChapter.data!.hrefs.total,
        widgetId: flowChapter.id,
      }
    : null;

  const trendChapter = withData.find(
    (c) => !used.has(c.id) && chapterKind(c) === 'trend' && c.data!.columns.length <= 1,
  );
  if (trendChapter) used.add(trendChapter.id);
  const net = trendChapter
    ? {
        months: trendChapter.data!.rows.map((row, r) => ({
          label: row.label,
          value: trendChapter.data!.rowTotals[r] ?? 0,
        })),
        href: trendChapter.data!.hrefs.total,
        widgetId: trendChapter.id,
      }
    : flow
      ? {
          months: flow.months.map((m) => ({ label: m.label, value: m.net })),
          href: flow.href,
          widgetId: null,
        }
      : null;

  const rankingChapter = withData.find((c) => !used.has(c.id) && chapterKind(c) === 'ranking');
  if (rankingChapter) used.add(rankingChapter.id);
  const spending = rankingChapter
    ? (() => {
        const parts = rankedTotals(rankingChapter.data!, 6);
        const total = Math.abs(rankingChapter.data!.total ?? sum(parts.map((p) => p.value)));
        return {
          total,
          widgetId: rankingChapter.id,
          parts: parts.map((part) => ({
            ...part,
            value: Math.abs(part.value),
            share: total === 0 ? 0 : Math.abs(part.value) / total,
          })),
        };
      })()
    : null;

  return {
    netWorth,
    flow,
    net,
    spending,
    insight: flow ? insightFrom(flow.months) : null,
    rest: chapters.filter((chapter) => !used.has(chapter.id)),
  };
}

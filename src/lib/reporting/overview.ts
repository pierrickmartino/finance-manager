import { timeAxisOf, type CardWidget, type MonthFlow } from './card';
import type { HeadlineTrend } from './net-worth-card';

export type { HeadlineTrend };

/**
 * The Dashboard Story's overview row (GLOSSARY: Dashboard Story, ADR-0009): its headline amount
 * and the latest month's insight, worked out from the Widgets' cards. Amounts in minor units.
 */

/** The overview row's opening number, where it drills down to, and Net worth under it. */
export interface HeadlineAmount {
  label: string;
  value: number;
  href: string;
  /** The last 24 months of Net worth: only under net worth today. */
  trend: HeadlineTrend | null;
}

/** Whether a Widget is Net worth over time: a balances Widget with a time axis. */
const isNetWorthOverTime = (widget: CardWidget): boolean =>
  widget.source === 'account_balances' && timeAxisOf(widget.query) !== null;

/**
 * The opening number: net worth today from the Account balances when the Dashboard has them,
 * with the Net worth trend under it, valued at the trend's latest point (every Account, today)
 * when it has one. Else the first other Widget's total. Net worth over time never leads, nor
 * names it: its total is its latest period's.
 */
export function headlineAmount(
  widgets: CardWidget[],
  trend: HeadlineTrend | null = null,
): HeadlineAmount | null {
  const totalled = widgets.filter(
    (widget) => !isNetWorthOverTime(widget) && widget.data?.total != null,
  );
  const balances = totalled.find((widget) => widget.source === 'account_balances');
  const lead = balances ?? totalled[0];
  if (!lead?.data || lead.data.total == null) return null;
  const latest = balances ? trend?.points.at(-1) : undefined;
  return {
    label: balances ? 'Your net worth today' : lead.name,
    value: latest?.value ?? lead.data.total,
    href: lead.data.hrefs.total,
    trend: latest ? trend : null,
  };
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const percent = (share: number): string => `${Math.round(Math.abs(share) * 100)}%`;

/** How far `latest` is from the average of `before`, as a share of it (0 when that is 0). */
export function changeOverAverage(latest: number, before: number[]): number {
  const average = sum(before) / before.length;
  return average === 0 ? 0 : (latest - average) / average;
}

/**
 * The insight callout: how the latest full month's spending compares with the full months
 * before it, and the share of income kept over them all. Null without two full months. Its
 * detail comes in three parts, the change in the middle, so the change can link on its own.
 */
export function spendingInsight(
  months: MonthFlow[],
): { headline: string; detail: [before: string, change: string, after: string] } | null {
  const full = months.filter((month) => !month.isPartial);
  const latest = full.at(-1);
  if (!latest || full.length < 2) return null;
  const before = full.slice(0, -1);
  const change = changeOverAverage(
    latest.expense,
    before.map((month) => month.expense),
  );
  const income = sum(full.map((month) => month.income));
  const kept = income === 0 ? 0 : (income - sum(full.map((month) => month.expense))) / income;
  const isEasing = change <= 0;
  return {
    headline: isEasing ? 'Spending is easing.' : 'Spending is running high.',
    detail: [
      `${latest.label} came in `,
      `${percent(change)} ${isEasing ? 'below' : 'above'}`,
      ` your monthly average, and you kept ${percent(kept)} of everything that came in.`,
    ],
  };
}

/** One full month's spending as the insight card draws it. */
export interface SpendingBar {
  label: string;
  expense: number;
  /** The bar's height, as a share of the tallest bar or the average line, whichever is higher. */
  share: number;
  /** The latest full month: the one the insight speaks of. */
  isLatest: boolean;
}

/**
 * The insight card's chart: each full month's spending, and the average line the latest is set
 * against (the full months before it, as in `spendingInsight`). Null without two full months.
 */
export function spendingBars(
  months: MonthFlow[],
): { bars: SpendingBar[]; average: number; averageShare: number } | null {
  const full = months.filter((month) => !month.isPartial);
  if (full.length < 2) return null;
  const before = full.slice(0, -1);
  const average = sum(before.map((month) => month.expense)) / before.length;
  const top = Math.max(average, ...full.map((month) => month.expense));
  const shareOf = (value: number): number => (top === 0 ? 0 : value / top);
  return {
    bars: full.map((month, index) => ({
      label: month.label,
      expense: month.expense,
      share: shareOf(month.expense),
      isLatest: index === full.length - 1,
    })),
    average,
    averageShare: shareOf(average),
  };
}

/** What the net worth card breaks down from an income-vs-expense Widget's months. */
export interface FlowSummary {
  /** Over every month shown, the running one included. */
  income: number;
  expense: number;
  kept: number;
  /** The share of income kept; null without income. */
  savingsRate: number | null;
  /** The average kept over the full months; null without one. */
  keptPerMonth: number | null;
  /** The full months that kept the most and the least; null with fewer than two to compare. */
  best: MonthFlow | null;
  leanest: MonthFlow | null;
}

export function flowSummary(months: MonthFlow[]): FlowSummary {
  const income = sum(months.map((month) => month.income));
  const expense = sum(months.map((month) => month.expense));
  const kept = income - expense;
  const full = months.filter((month) => !month.isPartial);
  const byNet = [...full].sort((a, b) => b.net - a.net);
  const hasPair = full.length >= 2;
  return {
    income,
    expense,
    kept,
    savingsRate: income === 0 ? null : kept / income,
    keptPerMonth: full.length === 0 ? null : sum(full.map((month) => month.net)) / full.length,
    best: hasPair ? byNet[0]! : null,
    leanest: hasPair ? byNet.at(-1)! : null,
  };
}

/** How many of `ticks` a share lights: in proportion, at least one for any share above zero. */
export function litTicks(share: number, ticks: number): number {
  if (share <= 0) return 0;
  return Math.min(ticks, Math.max(1, Math.round(share * ticks)));
}

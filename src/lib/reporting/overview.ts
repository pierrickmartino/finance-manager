import type { CardWidget, MonthFlow } from './card';

/**
 * The Dashboard Story's overview row (GLOSSARY: Dashboard Story, ADR-0009): its headline amount
 * and the latest month's insight, worked out from the Widgets' cards. Amounts in minor units.
 */

/** The overview row's opening number and where it drills down to. */
export interface HeadlineAmount {
  label: string;
  value: number;
  href: string;
}

/**
 * The opening number: net worth from the Account balances when the Dashboard has them, else
 * the first Widget total.
 */
export function headlineAmount(widgets: CardWidget[]): HeadlineAmount | null {
  const balances = widgets.find(
    (widget) => widget.source === 'account_balances' && widget.data?.total != null,
  );
  const lead = balances ?? widgets.find((widget) => widget.data?.total != null);
  if (!lead?.data || lead.data.total == null) return null;
  return {
    label: balances ? 'Your net worth today' : lead.name,
    value: lead.data.total,
    href: lead.data.hrefs.total,
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

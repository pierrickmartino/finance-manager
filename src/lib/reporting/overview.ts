import type { ReportHeader } from '@/server/services/reporting';
import { isTimeAxis } from '@/server/services/reporting/query';
import type { ChartSource } from './chart-data';
import { drillUrl } from './drill-link';
import type { StoryWidget } from './story';

/**
 * The Dashboard's cards (GLOSSARY: Dashboard Story, ADR-0009): what the overview row and the
 * Widget cards draw, worked out from the reporting engine's tables. Amounts in minor units.
 */

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

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** Which column holds the income and which the expense, or null for another kind of source. */
function flowSlots(data: ChartSource): { incomeSlot: number; expenseSlot: number } | null {
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

/**
 * Income and expense per row, when the source has one positive and one negative column
 * (an income-vs-expense Widget); null otherwise.
 */
export function monthFlows(data: ChartSource): MonthFlow[] | null {
  const slots = flowSlots(data);
  if (!slots) return null;
  const { incomeSlot, expenseSlot } = slots;
  return data.rows.map((row, r) => {
    const income = data.cells[r]?.[incomeSlot] ?? 0;
    const expense = 0 - (data.cells[r]?.[expenseSlot] ?? 0);
    return { label: row.label, isPartial: row.isPartial, income, expense, net: income - expense };
  });
}

/** The months of an income-vs-expense Widget, and where its figures drill down. */
export interface FoundMonthFlows {
  widgetId: string;
  months: MonthFlow[];
  /** All its Transactions: income and expense net to what was kept over the months. */
  href: string;
  /** The latest full month's Transactions (null when every month is still running). */
  latestHref: string | null;
  /** The expense of every full month, subtotalled per month, for the insight's change. */
  changeHref: string | null;
}

/**
 * The expense of the full months, with a subtotal per month: what the insight's change is
 * worked out from. Only for a sum whose rows are periods, as the subtotals are per period.
 */
function changeHref(data: ChartSource, expenseSlot: number): string | null {
  const { drill } = data;
  if (!drill || data.measure !== 'sum' || !isTimeAxis(drill.query.rows)) return null;
  const partial = data.rows.filter((row) => row.isPartial).map((row) => row.key);
  return drillUrl(drill, {
    row: { except: partial },
    column: data.columns[expenseSlot]!.key,
    change: true,
  });
}

/** The months of the first Widget that holds income and expense, or null. */
export function findMonthFlows(widgets: StoryWidget[]): FoundMonthFlows | null {
  for (const widget of widgets) {
    const slots = widget.data ? flowSlots(widget.data) : null;
    if (widget.data && slots) {
      const data = widget.data;
      const latest = latestFullIndex(data.rows);
      return {
        widgetId: widget.id,
        months: monthFlows(data)!,
        href: data.hrefs.total,
        latestHref: latest === -1 ? null : (data.hrefs.rowTotals[latest] ?? null),
        changeHref: changeHref(data, slots.expenseSlot),
      };
    }
  }
  return null;
}

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

/** Each value added to the ones before it (a running balance from period amounts). */
export function runningTotals(values: number[]): number[] {
  return values.map((_, index) => sum(values.slice(0, index + 1)));
}

/** The index of the last period that is over, or -1 when every one is still running. */
export function latestFullIndex(rows: Pick<ReportHeader, 'isPartial'>[]): number {
  return rows.findLastIndex((row) => !row.isPartial);
}

/** Each row's total (a period, for a trend or bars Widget), with its drill-down link. */
export function periodValues(data: ChartSource): PeriodValue[] {
  return data.rows.map((row, r) => ({
    label: row.label,
    value: data.rowTotals[r] ?? 0,
    href: data.hrefs.rowTotals[r] ?? data.hrefs.total,
    isPartial: row.isPartial,
  }));
}

/** How many of `ticks` a share lights: in proportion, at least one for any share above zero. */
export function litTicks(share: number, ticks: number): number {
  if (share <= 0) return 0;
  return Math.min(ticks, Math.max(1, Math.round(share * ticks)));
}

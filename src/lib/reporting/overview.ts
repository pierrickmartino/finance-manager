import type { ReportHeader } from '@/server/services/reporting';
import type { ChartSource } from './chart-data';
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

/**
 * Income and expense per row, when the source has one positive and one negative column
 * (an income-vs-expense Widget); null otherwise.
 */
export function monthFlows(data: ChartSource): MonthFlow[] | null {
  if (data.columns.length !== 2) return null;
  const [first, second] = data.columnTotals;
  if (first == null || second == null) return null;
  const incomeSlot = first >= second ? 0 : 1;
  const expenseSlot = 1 - incomeSlot;
  if ((data.columnTotals[incomeSlot] ?? 0) <= 0 || (data.columnTotals[expenseSlot] ?? 0) >= 0) {
    return null;
  }
  return data.rows.map((row, r) => {
    const income = data.cells[r]?.[incomeSlot] ?? 0;
    const expense = 0 - (data.cells[r]?.[expenseSlot] ?? 0);
    return { label: row.label, isPartial: row.isPartial, income, expense, net: income - expense };
  });
}

/** The months of the first Widget that holds income and expense, or null. */
export function findMonthFlows(
  widgets: StoryWidget[],
): { widgetId: string; months: MonthFlow[]; href: string } | null {
  for (const widget of widgets) {
    const months = widget.data ? monthFlows(widget.data) : null;
    if (widget.data && months) {
      return { widgetId: widget.id, months, href: widget.data.hrefs.total };
    }
  }
  return null;
}

const percent = (share: number): string => `${Math.round(Math.abs(share) * 100)}%`;

/**
 * The insight callout: how the latest full month's spending compares with the full months
 * before it, and the share of income kept over them all. Null without two full months.
 */
export function spendingInsight(months: MonthFlow[]): { headline: string; detail: string } | null {
  const full = months.filter((month) => !month.isPartial);
  const latest = full.at(-1);
  if (!latest || full.length < 2) return null;
  const before = full.slice(0, -1);
  const average = sum(before.map((month) => month.expense)) / before.length;
  const change = average === 0 ? 0 : (latest.expense - average) / average;
  const income = sum(full.map((month) => month.income));
  const kept = income === 0 ? 0 : (income - sum(full.map((month) => month.expense))) / income;
  const isEasing = change <= 0;
  return {
    headline: isEasing ? 'Spending is easing.' : 'Spending is running high.',
    detail:
      `${latest.label} came in ${percent(change)} ${isEasing ? 'below' : 'above'} your monthly ` +
      `average, and you kept ${percent(kept)} of everything that came in.`,
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

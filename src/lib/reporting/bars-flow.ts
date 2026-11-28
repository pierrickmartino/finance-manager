import type { ChartSource } from './chart-data';
import { asExpense, type FlowSlots } from './line-flow';

/**
 * A bars flow (GLOSSARY: Card; ADR-0022): a bars Widget whose two columns are its income and
 * its expense, drawn as grouped bars, an Income bar and an Expense bar per Interval on one
 * shared scale. Amounts are minor units.
 */

/**
 * One Interval's pair of bars: what came in and what went out, both positive while money came
 * in and went out, and signed when a side nets the wrong way (refunds outweighing spending).
 * Each link opens the Drill-down of its Interval and side, which sums to the bar.
 */
export interface IntervalPair {
  label: string;
  /**
   * The row's key: a month's, quarter's or year's (`2025-03`, `2025-Q1`, `2025`), or a day's
   * (`2025-03-14`) by day; null for a row with no key (the "none" bucket of its axis).
   */
  key: string | null;
  /** The Interval is cut short at the Period's start or still running ("to date"). */
  isPartial: boolean;
  /** The Interval is still running: its range reaches today, so its numbers will still change. */
  isRunning: boolean;
  income: number;
  expense: number;
  incomeHref: string;
  expenseHref: string;
}

/** A bars flow's mark: a bar pair for every Interval the Widget holds. */
export interface GroupedBarsMark {
  type: 'groupedBars';
  intervals: IntervalPair[];
}

/**
 * Each row's income and expense, read once: what the grouped bars draw, the sentence tells and
 * the card's flow sums.
 */
export function intervalPairsOf(
  data: ChartSource,
  { incomeSlot, expenseSlot }: FlowSlots,
): IntervalPair[] {
  return data.rows.map((row, r) => ({
    label: row.label,
    key: row.key,
    isPartial: row.isPartial,
    isRunning: row.isPartial && !row.isCutShort,
    income: data.cells[r]?.[incomeSlot] ?? 0,
    expense: asExpense(data.cells[r]?.[expenseSlot]),
    incomeHref: data.hrefs.cells[r]?.[incomeSlot] ?? data.hrefs.total,
    expenseHref: data.hrefs.cells[r]?.[expenseSlot] ?? data.hrefs.total,
  }));
}

export function groupedBarsMark(intervals: IntervalPair[]): GroupedBarsMark {
  return { type: 'groupedBars', intervals };
}

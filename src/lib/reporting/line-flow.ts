import type { CardReading } from './card';
import type { ChartSource } from './chart-data';
import { drillUrl } from './drill-link';

/**
 * A line flow (GLOSSARY: Card; ADR-0020): a line Widget whose two columns are income and
 * expense, drawn as two overlapping areas. By day each point is a running total from the first
 * row, so the last gap is the Profit of the whole stretch; by any other Interval it is each
 * row's own amounts. Amounts are minor units.
 */

type Money = (minor: number) => string;

/** Which column holds the income and which the expense. */
export interface FlowSlots {
  incomeSlot: number;
  expenseSlot: number;
}

/**
 * One point of a line flow's two areas: its row's income and expense (both positive while
 * money came in and went out), or, drawn as running totals, what came in and went out from
 * the first row through this one. Each link opens the Drill-down whose working gives it:
 * `href` both columns together (the gap between the areas), the others one column each.
 */
export interface FlowPoint {
  label: string;
  /** The row's key: its date or Interval (`2025-03-14`, `2025-03`, `2025-Q1`, `2025`). */
  key: string | null;
  /** The row is still running (its numbers will still change). */
  isPartial: boolean;
  income: number;
  expense: number;
  href: string;
  incomeHref: string;
  expenseHref: string;
}

/** A line flow's mark: running when each point is the total from the first row through it. */
export interface AreasMark {
  type: 'areas';
  isRunning: boolean;
  points: FlowPoint[];
}

/**
 * An expense cell as the positive amount that went out (a refund month reads negative). Taken
 * from zero rather than negated, so an empty cell reads 0 and never -0.
 */
export const asExpense = (signed: number | null | undefined): number => 0 - (signed ?? 0);

/** Each value summed with every one before it: `[1, 2, 3]` → `[1, 3, 6]`. */
export function runningSums(values: readonly number[]): number[] {
  // One pass: the total so far is the only state, and it never leaves this function.
  let total = 0;
  return values.map((value) => (total += value));
}

/** A line flow's points: each row's own income and expense, and its Drill-downs. */
function flowPointsOf(data: ChartSource, { incomeSlot, expenseSlot }: FlowSlots): FlowPoint[] {
  return data.rows.map((row, r) => ({
    label: row.label,
    key: row.key,
    isPartial: row.isPartial,
    income: data.cells[r]?.[incomeSlot] ?? 0,
    expense: asExpense(data.cells[r]?.[expenseSlot]),
    href: data.hrefs.rowTotals[r] ?? data.hrefs.total,
    incomeHref: data.hrefs.cells[r]?.[incomeSlot] ?? data.hrefs.total,
    expenseHref: data.hrefs.cells[r]?.[expenseSlot] ?? data.hrefs.total,
  }));
}

/**
 * The Drill-down of every row from the first through `key` (one column, or both without one):
 * what a running point adds up. Without a query to drill into, the whole range.
 */
function throughHref(data: ChartSource, key: string | null, column?: string | null): string {
  if (!data.drill || key === null) return data.hrefs.total;
  return drillUrl(data.drill, {
    row: { through: key },
    ...(column === undefined ? {} : { column }),
  });
}

/**
 * A line flow's points as running totals: each what came in and went out from the first row
 * through its own, its Drill-downs those rows for its column.
 */
function runningPointsOf(data: ChartSource, slots: FlowSlots): FlowPoint[] {
  const own = flowPointsOf(data, slots);
  const income = data.columns[slots.incomeSlot]!.key;
  const expense = data.columns[slots.expenseSlot]!.key;
  const incomeSoFar = runningSums(own.map((point) => point.income));
  const expenseSoFar = runningSums(own.map((point) => point.expense));
  return own.map((point, i) => ({
    ...point,
    income: incomeSoFar[i]!,
    expense: expenseSoFar[i]!,
    href: throughHref(data, point.key),
    incomeHref: throughHref(data, point.key, income),
    expenseHref: throughHref(data, point.key, expense),
  }));
}

/** A line flow's two areas: running totals by day, each row's own amounts otherwise. */
export function areasMark(data: ChartSource, slots: FlowSlots, isRunning: boolean): AreasMark {
  return {
    type: 'areas',
    isRunning,
    points: isRunning ? runningPointsOf(data, slots) : flowPointsOf(data, slots),
  };
}

/**
 * A running flow: what was kept over the whole stretch (its last gap), and the two column
 * totals it is the difference of, each opening its Drill-down.
 */
export function runningFlowSentences(
  data: ChartSource,
  { incomeSlot, expenseSlot }: FlowSlots,
  money: Money,
): Pick<CardReading, 'lead' | 'facts'> {
  const income = data.columnTotals[incomeSlot] ?? 0;
  const expense = asExpense(data.columnTotals[expenseSlot]);
  return {
    lead: { headline: 'Profit', detail: money(income - expense), href: data.hrefs.total },
    facts: [
      {
        label: 'Came in',
        value: money(income),
        href: data.hrefs.columnTotals[incomeSlot] ?? data.hrefs.total,
      },
      {
        label: 'Went out',
        value: money(expense),
        href: data.hrefs.columnTotals[expenseSlot] ?? data.hrefs.total,
      },
    ],
  };
}

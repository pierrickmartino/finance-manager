import type { ChartSource } from '@/lib/reporting/chart-data';
import type { ReportTable } from '../reporting';
import type { AnalyticsPeriod } from './window';

/**
 * The sparklines of Analytics' Key figures (spec #225, ticket #230): Income, Expense and Profit
 * a point per period of the Period window, read off Spending Insights' income and expense;
 * Net worth the points of the Net worth trend, each period end of the window then today. The
 * current period's point is partial (ADR-0015): it is drawn set apart, never read as a drop.
 */

/** One point of a sparkline: CHF minor units. */
export interface SparklinePoint {
  label: string;
  value: number;
  /** The current period, to date. */
  isPartial: boolean;
}

export type FlowSparklines = Record<'income' | 'expense' | 'profit', SparklinePoint[]>;

/** A chart source's value at a row and column key; 0 where nothing falls. */
function valueAt(data: ChartSource | null, rowKey: string, columnKey: string): number {
  if (!data) return 0;
  const r = data.rows.findIndex((row) => row.key === rowKey);
  const c = data.columns.findIndex((column) => column.key === columnKey);
  return r < 0 || c < 0 ? 0 : (data.cells[r]?.[c] ?? 0);
}

/**
 * Income, Expense and Profit in each period of the window, from Spending Insights' data
 * (periods down, Category group types across). A period it leaves out, before its first data,
 * spent and earned nothing. Expense is what went out, as a positive amount.
 */
export function flowSparklines(
  flow: ChartSource | null,
  window: readonly AnalyticsPeriod[],
): FlowSparklines {
  const periods = window.map((period) => {
    const income = valueAt(flow, period.key, 'income');
    const expense = 0 - valueAt(flow, period.key, 'expense');
    return { period, income, expense, profit: income - expense };
  });
  const line = (pick: (p: (typeof periods)[number]) => number): SparklinePoint[] =>
    periods.map((p) => ({ label: p.period.label, value: pick(p), isPartial: p.period.isToDate }));
  return {
    income: line((p) => p.income),
    expense: line((p) => p.expense),
    profit: line((p) => p.profit),
  };
}

/** Net worth's points: the Net worth trend's, each period end of the window, then today. */
export function netWorthSparkline(trend: ReportTable): SparklinePoint[] {
  return trend.rows.map((row, r) => ({
    label: row.label,
    value: trend.rowTotals[r] ?? 0,
    isPartial: row.isPartial,
  }));
}

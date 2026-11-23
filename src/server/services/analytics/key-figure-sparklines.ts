import type { ChartSource } from '@/lib/reporting/chart-data';
import type { ReportTable } from '../reporting';
import { flowFigures, type FlowFigures } from './flow-figures';
import { isIncomplete, type AnalyticsReading } from './reading';

/**
 * The sparklines of Analytics' Key figures (spec #225, ticket #230): Income, Expense and Profit
 * a point per interval of the Period, read off Spending Insights' income and expense;
 * Net worth the points of the Net worth trend, each interval end of the Period then today. The
 * Period's incomplete intervals are partial (ADR-0016): drawn set apart, never read as a drop.
 */

/** One point of a sparkline: CHF minor units. */
export interface SparklinePoint {
  label: string;
  value: number;
  /** The current interval, to date. */
  isPartial: boolean;
}

export type FlowSparklines = Record<keyof FlowFigures, SparklinePoint[]>;

/** A chart source's value at a row and column key; 0 where nothing falls. */
function valueAt(data: ChartSource | null, rowKey: string, columnKey: string): number {
  if (!data) return 0;
  const r = data.rows.findIndex((row) => row.key === rowKey);
  const c = data.columns.findIndex((column) => column.key === columnKey);
  return r < 0 || c < 0 ? 0 : (data.cells[r]?.[c] ?? 0);
}

/**
 * Income, Expense and Profit in each interval of the Period, from Spending Insights' data
 * (intervals down, Category group types across). An interval it leaves out, before its first data,
 * spent and earned nothing. Expense is what went out, as a positive amount.
 */
export function flowSparklines(
  flow: ChartSource | null,
  reading: AnalyticsReading,
): FlowSparklines {
  const intervals = reading.intervals.map((interval) => ({
    interval,
    figures: flowFigures(
      valueAt(flow, interval.key, 'income'),
      valueAt(flow, interval.key, 'expense'),
    ),
  }));
  const line = (id: keyof FlowFigures): SparklinePoint[] =>
    intervals.map(({ interval, figures }) => ({
      label: interval.label,
      value: figures[id],
      isPartial: isIncomplete(interval),
    }));
  return { income: line('income'), expense: line('expense'), profit: line('profit') };
}

/** Net worth's points: the Net worth trend's, the Period's start, each interval end, then today. */
export function netWorthSparkline(trend: ReportTable): SparklinePoint[] {
  return trend.rows.map((row, r) => ({
    label: row.label,
    value: trend.rowTotals[r] ?? 0,
    isPartial: row.isPartial,
  }));
}

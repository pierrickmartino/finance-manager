import type { ChartSource } from '@/lib/reporting/chart-data';
import type { ReportTable } from '../reporting';
import { flowFigures, type FlowFigures } from './flow-figures';
import { isIncomplete, type AnalyticsReading } from './reading';

/**
 * The sparklines of Analytics' Key figures (spec #225, ticket #230): Income, Expense and Profit
 * a point per period of the Span, read off Spending Insights' income and expense;
 * Net worth the points of the Net worth trend, each period end of the Span then today. The
 * Span's incomplete periods are partial (ADR-0016): drawn set apart, never read as a drop.
 */

/** One point of a sparkline: CHF minor units. */
export interface SparklinePoint {
  label: string;
  value: number;
  /** The current period, to date. */
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
 * Income, Expense and Profit in each period of the Span, from Spending Insights' data
 * (periods down, Category group types across). A period it leaves out, before its first data,
 * spent and earned nothing. Expense is what went out, as a positive amount.
 */
export function flowSparklines(
  flow: ChartSource | null,
  reading: AnalyticsReading,
): FlowSparklines {
  const periods = reading.periods.map((period) => ({
    period,
    figures: flowFigures(valueAt(flow, period.key, 'income'), valueAt(flow, period.key, 'expense')),
  }));
  const line = (id: keyof FlowFigures): SparklinePoint[] =>
    periods.map(({ period, figures }) => ({
      label: period.label,
      value: figures[id],
      isPartial: isIncomplete(period),
    }));
  return { income: line('income'), expense: line('expense'), profit: line('profit') };
}

/** Net worth's points: the Net worth trend's, each period end of the Span, then today. */
export function netWorthSparkline(trend: ReportTable): SparklinePoint[] {
  return trend.rows.map((row, r) => ({
    label: row.label,
    value: trend.rowTotals[r] ?? 0,
    isPartial: row.isPartial,
  }));
}

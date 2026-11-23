import type { ServiceContext } from '../context';
import { listCellTransactions, type ReportTable } from '../reporting';
import type { CellRef } from '../reporting/cell-ref';
import type { WidgetQueryInput } from '../reporting/query';

/**
 * Reading the Net cash flow section's flows by Category group type: every non-Transfer flow,
 * Capital included, a row per type, Unclassified Transactions (no Category) in the `null` row.
 * Profit and loss and Income vs. expense read it; both show Unclassified only when the Span has
 * some Unclassified Transactions (`hasTransactions`).
 */

/** A Category group type, as a key of the report's rows: `null` is Unclassified. */
export type GroupTypeKey = 'income' | 'expense' | 'capital' | null;

/** The query by Category group type over some dates, with a column per period or none. */
export const byGroupType = (
  dateRange: WidgetQueryInput['dateRange'],
  columns: WidgetQueryInput['columns'] = null,
): WidgetQueryInput => ({
  dateRange,
  rows: 'categoryGroupType',
  columns,
  includeCapital: true,
});

/** A Category group type's total in the report; 0 when nothing of it falls in its dates. */
export function typeTotal(report: ReportTable, type: GroupTypeKey): number {
  const index = report.rows.findIndex((row) => row.key === type);
  return index < 0 ? 0 : (report.rowTotals[index] ?? 0);
}

/** How many Transactions a cell holds: those it counts and those left out for want of an FX rate. */
export interface CellCount {
  counted: number;
  unconverted: number;
}

export async function cellCount(
  ctx: ServiceContext,
  report: ReportTable,
  cell: CellRef,
): Promise<CellCount> {
  const page = await listCellTransactions(ctx, report.query, { ...cell, pageSize: 1 });
  return { counted: page.total, unconverted: page.unconvertedCount };
}

/** The Unclassified Transactions of a report by Category group type: its `null` row. */
export const UNCLASSIFIED_CELL: CellRef = { row: null };

/**
 * Whether a cell holds any Transaction, counted or left out unconverted, even if they net to
 * zero: when an Unclassified row shows.
 */
export const hasTransactions = ({ counted, unconverted }: CellCount): boolean =>
  counted + unconverted > 0;

import type { ChartSource } from '@/lib/reporting/chart-data';
import { originToParams, type DrillOrigin } from '@/lib/reporting/drill-origin';
import { cellToParams, queryToParams } from '@/lib/reporting/widget-params';
import type { CellRef, ReportHeader, ReportTable } from '@/server/services/reporting';

/**
 * The Drill-down of one cell of a Widget query, which links back to `origin` (by default the
 * editor, with the query).
 */
export function drillHref(
  report: ReportTable,
  cell: CellRef,
  origin: DrillOrigin = { kind: 'editor' },
): string {
  const params = queryToParams(report.query);
  for (const [name, value] of cellToParams(cell)) params.set(name, value);
  for (const [name, value] of originToParams(origin)) params.set(name, value);
  return `/widgets/drill?${params}`;
}

/** Every value's Drill-down, opened from `origin`. */
export function drillLinks(report: ReportTable, origin: DrillOrigin): (cell: CellRef) => string {
  return (cell) => drillHref(report, cell, origin);
}

/** The cell key for a header, or undefined (the whole axis) when the report has no such axis. */
function key(axis: unknown, header: ReportHeader): string | null | undefined {
  return axis === null ? undefined : header.key;
}

/**
 * The engine's table with a link for every value: by default its Drill-down from the editor;
 * `hrefOf` links elsewhere (a Drill-down from a Dashboard or a Widget with `drillLinks`, or the
 * Account balances to each Account).
 */
export function toPivotData(
  report: ReportTable,
  hrefOf: (cell: CellRef) => string = (cell) => drillHref(report, cell),
): ChartSource {
  const row = (header: ReportHeader) => key(report.query.rows, header);
  const column = (header: ReportHeader) => key(report.query.columns, header);
  return {
    measure: report.query.measure,
    rows: report.rows,
    columns: report.columns,
    cells: report.cells,
    rowTotals: report.rowTotals,
    columnTotals: report.columnTotals,
    total: report.total,
    hrefs: {
      cells: report.rows.map((r) =>
        report.columns.map((c) => hrefOf({ row: row(r), column: column(c) })),
      ),
      rowTotals: report.rows.map((r) => hrefOf({ row: row(r) })),
      columnTotals: report.columns.map((c) => hrefOf({ column: column(c) })),
      total: hrefOf({}),
    },
  };
}

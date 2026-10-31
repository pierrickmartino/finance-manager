import { cellToParams, queryToParams } from '@/lib/reporting/widget-params';
import type { CellRef, ReportHeader, ReportTable } from '@/server/services/reporting';
import type { PivotData } from './pivot-table';

/** The drill-down page of one cell of a Widget query. */
export function drillHref(report: ReportTable, cell: CellRef): string {
  const params = queryToParams(report.query);
  for (const [name, value] of cellToParams(cell)) params.set(name, value);
  return `/reports/drill?${params}`;
}

/** The cell key for a header, or undefined (the whole axis) when the report has no such axis. */
function key(axis: unknown, header: ReportHeader): string | null | undefined {
  return axis === null ? undefined : header.key;
}

/** The engine's table with a drill-down link for every value. */
export function toPivotData(report: ReportTable): PivotData {
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
        report.columns.map((c) => drillHref(report, { row: row(r), column: column(c) })),
      ),
      rowTotals: report.rows.map((r) => drillHref(report, { row: row(r) })),
      columnTotals: report.columns.map((c) => drillHref(report, { column: column(c) })),
      total: drillHref(report, {}),
    },
  };
}

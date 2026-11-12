import type { ChartSource } from '@/lib/reporting/chart-data';
import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import type { DrillOrigin } from '@/lib/reporting/drill-origin';
import type { CellRef, ReportHeader, ReportTable } from '@/server/services/reporting';

const EDITOR: DrillOrigin = { kind: 'editor' };

/**
 * The Drill-down of one cell of a Widget query, which links back to `origin` (by default the
 * editor, with the query).
 */
export function drillHref(
  report: ReportTable,
  cell: CellRef,
  origin: DrillOrigin = EDITOR,
): string {
  return drillUrl({ query: report.query, origin }, cell);
}

/**
 * Where a report's values link: `hrefOf` gives each cell's link, and `drill` is where the
 * values a chart works out itself (an "Other", an average) drill down, or null when they
 * don't (Account balances).
 */
export interface PivotLinks {
  hrefOf: (cell: CellRef) => string;
  drill: DrillTarget | null;
}

/** Every value's Drill-down, opened from `origin`. */
export function drillLinks(report: ReportTable, origin: DrillOrigin = EDITOR): PivotLinks {
  const drill = { query: report.query, origin };
  return { hrefOf: (cell) => drillUrl(drill, cell), drill };
}

/** The cell key for a header, or undefined (the whole axis) when the report has no such axis. */
function key(axis: unknown, header: ReportHeader): string | null | undefined {
  return axis === null ? undefined : header.key;
}

/**
 * The engine's table with a link for every value: by default its Drill-down from the editor;
 * `links` link elsewhere (a Drill-down from a Dashboard or a Widget with `drillLinks`, or the
 * Account balances to each Account).
 */
export function toPivotData(
  report: ReportTable,
  { hrefOf, drill }: PivotLinks = drillLinks(report),
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
    drill,
  };
}

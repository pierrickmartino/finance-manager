import type { CellRef, ReportHeader, ReportTable } from '@/server/services/reporting';
import type { ChartSource } from './chart-data';
import { drillUrl, type DrillTarget } from './drill-link';
import { EDITOR, type DrillOrigin } from './drill-origin';

/**
 * A report as the charts and cards read it (`ChartSource`): the engine's table with a link for
 * every value. Shared by the Widget pages, the Dashboard and Analytics.
 */

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

/** An Account balance links to its Account, the total to the Accounts page. */
export function balanceHref(cell: CellRef): string {
  return typeof cell.row === 'string' ? `/accounts/${cell.row}` : '/accounts';
}

/** Account balances aren't Transactions: no Drill-down, only their Accounts. */
export const BALANCE_LINKS: PivotLinks = { hrefOf: balanceHref, drill: null };

/**
 * The cell key for a header, or undefined (the whole axis) for the single all-values header of
 * an axis the query doesn't have. Net worth over time keys its columns by account kind though
 * its query has no column axis, so a keyed header keeps its key.
 */
function key(axis: unknown, header: ReportHeader): string | null | undefined {
  return axis === null && header.key === null ? undefined : header.key;
}

/** The engine's table with a link for every value, as `links` say. */
export function toChartSource(report: ReportTable, { hrefOf, drill }: PivotLinks): ChartSource {
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

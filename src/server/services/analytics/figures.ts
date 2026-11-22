import { analyticsDrillUrl, analyticsOrigin } from '@/lib/analytics/links';
import type { WidgetCardData } from '@/lib/reporting/card';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { drillLinks, toChartSource } from '@/lib/reporting/pivot-source';
import type { ReportTable } from '../reporting';
import type { ReportHeader } from '../reporting/headers';
import type { AxisSelector, CellRef } from '../reporting/cell-ref';
import type { WidgetQuery } from '../reporting/query';
import type { Visualisation, WidgetSource } from '../reporting/widgets';
import { isIncomplete, type AnalyticsReading } from './reading';

/**
 * The building blocks of Analytics' sections. Each section is drawn by the Dashboard's own
 * cards (GLOSSARY: Card), so it hands them what they read from a Widget: its data as a chart
 * source, every value linked to its Drill-down back to Analytics, read the same way.
 */

/** A figure's Drill-down (GLOSSARY): the query and cell `listCellTransactions` reads. */
export interface DrillRef {
  query: WidgetQuery;
  cell: CellRef;
}

/** One reported number: CHF minor units, null where no Transaction falls. */
export interface Figure {
  value: number | null;
  drill: DrillRef;
}

/** What every section says besides its figures. */
export interface SectionStatus {
  /** Nothing the section reports falls in the window. */
  isEmpty: boolean;
  /** Transactions (Accounts, for balances) left out for want of an FX rate. */
  unconvertedCount: number;
}

/** A report's status: empty without a total, and what it left out. */
export function statusOf(report: ReportTable): SectionStatus {
  return { isEmpty: report.total === null, unconvertedCount: report.unconvertedCount };
}

/** A section drawn as a Dashboard card: what the card reads, and whether it has anything. */
export interface AnalyticsCard extends WidgetCardData {
  isEmpty: boolean;
}

/**
 * What Net worth and the Key figures read from other sections, sharing their promises rather
 * than run them again: the Account balances, Net worth's trend and Spending Insights' income and
 * expense.
 */
export interface SharedSections {
  balances: Promise<AnalyticsCard>;
  trend: Promise<ReportTable>;
  flow: Promise<AnalyticsCard>;
}

export interface AnalyticsCardSpec {
  id: string;
  name: string;
  source?: WidgetSource;
  visualisation: Visualisation;
  /** The data's row axis, as a Widget query's (a time axis makes balances Net worth). */
  rows: WidgetQuery['rows'];
  data: ChartSource;
  status: SectionStatus;
}

/** A section's card, as a Widget's on the Dashboard Story. */
export function analyticsCard(spec: AnalyticsCardSpec): AnalyticsCard {
  return {
    id: `analytics-${spec.id}`,
    name: spec.name,
    source: spec.source ?? 'query',
    visualisation: spec.visualisation,
    query: { rows: spec.rows },
    data: spec.data,
    error: null,
    ...spec.status,
  };
}

/** A report's values, each opening its Drill-down from Analytics, read the same way. */
export function reportSource(report: ReportTable, reading: AnalyticsReading): ChartSource {
  return toChartSource(report, drillLinks(report, analyticsOrigin(reading)));
}

/** The sum of some figures; null when every one is null. */
export function sumOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

/** A report's cell by its row and column keys. */
export function cellOf(report: ReportTable) {
  const rowIndex = new Map(report.rows.map((row, index) => [row.key, index]));
  const columnIndex = new Map(report.columns.map((column, index) => [column.key, index]));
  return (rowKey: string | null, columnKey: string | null): number | null => {
    const r = rowIndex.get(rowKey);
    const c = columnIndex.get(columnKey);
    return r === undefined || c === undefined ? null : (report.cells[r]?.[c] ?? null);
  };
}

/** A row worked out by Analytics itself: a figure per period of the window, then its Total. */
export interface PeriodRow {
  key: string;
  label: string;
  cells: Figure[];
  /** The whole window, the current period included. */
  total: Figure;
}

export interface PeriodRowSpec {
  key: string;
  label: string;
  /** The query behind the row; its columns are the reading's periods. */
  query: WidgetQuery;
  /** The row's selector on the query's rows; absent for the whole of them. */
  selector?: AxisSelector;
  /** The row's value in one period of the window. */
  valueAt: (periodKey: string) => number | null;
}

/** A row of figures over the reading, each with its Drill-down: a cell per period, and the Total. */
export function periodRow(reading: AnalyticsReading, spec: PeriodRowSpec): PeriodRow {
  const { query, selector } = spec;
  const at = (period?: string): CellRef => ({
    ...(selector === undefined ? {} : { row: selector }),
    ...(period === undefined ? {} : { column: period }),
  });
  const cells = reading.periods.map((period) => ({
    value: spec.valueAt(period.key),
    drill: { query, cell: at(period.key) },
  }));
  return {
    key: spec.key,
    label: spec.label,
    cells,
    total: { value: sumOf(cells.map((cell) => cell.value)), drill: { query, cell: at() } },
  };
}

/** A reading's periods as a card's column headers, a partial or to-date one partial. */
function periodHeaders(reading: AnalyticsReading): ReportHeader[] {
  return reading.periods.map((period) => ({
    key: period.key,
    label: period.label,
    isPartial: isIncomplete(period),
  }));
}

/**
 * Rows Analytics works out itself (a net, a subtotal) as a card's data, periods across. Each
 * column total and the total are the report's own: every row's Transactions in that period.
 */
export function periodRowsSource(
  reading: AnalyticsReading,
  rows: readonly PeriodRow[],
  report: ReportTable,
): ChartSource {
  const href = ({ query, cell }: DrillRef) => analyticsDrillUrl(reading, query, cell);
  const { periods } = reading;
  const totals = new Map(report.columns.map((column, c) => [column.key, report.columnTotals[c]]));
  return {
    measure: 'sum',
    rows: rows.map((row) => ({ key: row.key, label: row.label, isPartial: false })),
    columns: periodHeaders(reading),
    cells: rows.map((row) => row.cells.map((cell) => cell.value)),
    rowTotals: rows.map((row) => row.total.value),
    columnTotals: periods.map((period) => totals.get(period.key) ?? null),
    total: report.total,
    hrefs: {
      cells: rows.map((row) => row.cells.map((cell) => href(cell.drill))),
      rowTotals: rows.map((row) => href(row.total.drill)),
      columnTotals: periods.map((period) =>
        href({ query: report.query, cell: { column: period.key } }),
      ),
      total: href({ query: report.query, cell: {} }),
    },
    // Its rows are no single axis of one query: nothing a card works out itself can drill.
    drill: null,
  };
}

import { divideRounded } from '@/lib/reporting/average';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { ReportTable } from '../reporting';
import type { AxisSelector, CellRef } from '../reporting/cell-ref';
import type { WidgetQuery } from '../reporting/query';
import type { AnalyticsPeriod } from './window';

/**
 * The building blocks of Analytics' per-period sections: a figure with the Drill-down behind
 * it, and a table row of figures per period of the Period window with its Total and Average.
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

/** A table row: a figure per period of the window, then Total and Average. */
export interface FigureRow<Key extends string = string> {
  key: Key;
  label: string;
  cells: Figure[];
  /** The whole window, the current period included. */
  total: Figure;
  /** The complete periods' sum over their count: the current period is left out. */
  average: Figure;
}

/** A section's table: periods as columns, oldest first, then Total and Average. */
export interface PeriodTable<Key extends string = string> {
  periods: AnalyticsPeriod[];
  rows: FigureRow<Key>[];
  /** No Transaction falls in the window. */
  isEmpty: boolean;
  /** Transactions left out for want of an FX rate. */
  unconvertedCount: number;
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

export interface PeriodRowSpec<Key extends string> {
  key: Key;
  label: string;
  /** The query behind the row; its columns are the view's periods. */
  query: WidgetQuery;
  /** The row's selector on the query's rows axis; absent for the whole column. */
  row?: AxisSelector;
  /** The row's value in one period of the window. */
  valueAt: (periodKey: string) => number | null;
}

/** The cell of a row selector and a column selector, leaving out an absent row. */
function cellRef(row: AxisSelector | undefined, column?: AxisSelector): CellRef {
  return {
    ...(row === undefined ? {} : { row }),
    ...(column === undefined ? {} : { column }),
  };
}

/**
 * A row of figures over the window, each with its Drill-down: a cell per period, the Total
 * (the whole column axis) and the Average, drilled as the `average` measure over every period
 * but the current one, which divides by the same count of complete periods.
 */
export function periodRow<Key extends string>(
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
  spec: PeriodRowSpec<Key>,
): FigureRow<Key> {
  const { query, row } = spec;
  const cells = window.map((period) => ({
    value: spec.valueAt(period.key),
    drill: { query, cell: cellRef(row, period.key) },
  }));
  const complete = window.flatMap((period, index) => (period.isToDate ? [] : [cells[index]!]));
  const completeSum = sumOf(complete.map((cell) => cell.value));
  const current = window.filter((period) => period.isToDate).map((period) => period.key);
  return {
    key: spec.key,
    label: spec.label,
    cells,
    total: { value: sumOf(cells.map((cell) => cell.value)), drill: { query, cell: cellRef(row) } },
    average: {
      value: completeSum === null ? null : divideRounded(completeSum, complete.length),
      drill: {
        query: { ...query, measure: 'average', averagePer: view },
        cell: cellRef(row, { except: current }),
      },
    },
  };
}

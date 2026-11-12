import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { ReportHeader } from '@/server/services/reporting/headers';
import type { Measure } from '@/server/services/reporting/query';
import { drillUrl, type DrillTarget } from './drill-link';

/**
 * The data mapping behind the chart visualisations (spec 104). Every chart is a pure renderer
 * over the reporting engine's result table: these functions turn that table (with a drill-down
 * link per value) into what a chart draws, and the chart components only draw it.
 */

/** The engine's table plus where each value drills down to (same shape as the values). */
export interface ChartSource {
  measure: Measure;
  rows: ReportHeader[];
  columns: ReportHeader[];
  cells: (number | null)[][];
  rowTotals: (number | null)[];
  columnTotals: (number | null)[];
  total: number | null;
  hrefs: {
    cells: string[][];
    rowTotals: string[];
    columnTotals: string[];
    total: string;
  };
  /**
   * Where the values the charts work out themselves ("Other", an average) drill down: null
   * when they don't (Account balances, which aren't Transactions).
   */
  drill: DrillTarget | null;
}

type Axis = 'rows' | 'columns';

/** A header's key in a Drill-down cell; undefined (the whole axis) when the query has no axis. */
function cellKey(data: ChartSource, axis: Axis, header: ReportHeader): string | null | undefined {
  return data.drill?.query[axis] === null ? undefined : header.key;
}

/**
 * The Drill-down of every key of `axis` but `kept` (in the cell `rest`), or null where it would
 * not add up to the folded value: without Drill-downs, or on the Tag axis, where a Transaction
 * with two folded Tags counts twice in the value but is listed once.
 */
function foldedHref(
  data: ChartSource,
  axis: Axis,
  kept: ReportHeader[],
  rest: CellRef = {},
): string | null {
  if (!data.drill || data.drill.query[axis] === 'tag') return null;
  const except = { except: kept.map((header) => header.key) };
  return drillUrl(data.drill, { ...rest, [axis === 'rows' ? 'row' : 'column']: except });
}

/**
 * Categorical colours per chart: a ninth series is never a new hue, it folds into "Other"
 * (the last slot).
 */
export const MAX_SERIES = 8;
export const OTHER_LABEL = 'Other';

/** One series of a line or stacked bar chart; `slot` is its categorical colour (0-based). */
export interface ChartSeries {
  key: string;
  label: string;
  slot: number;
}

/** One x-axis position: a value and a drill-down link per series key (null: none). */
export interface ChartPoint {
  label: string;
  values: Record<string, number | null>;
  hrefs: Record<string, string | null>;
}

export interface SeriesChart {
  series: ChartSeries[];
  points: ChartPoint[];
  /** Each series' Drill-down over the whole range, by series key (null: none). */
  totalHrefs: Record<string, string | null>;
}

function headerLabel(header: ReportHeader): string {
  return header.isPartial ? `${header.label} (partial)` : header.label;
}

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

/**
 * Line and stacked bar: the rows run along the x axis (periods, usually) and each column is a
 * series. Columns past the eighth fold into one "Other" series, which drills down to every
 * column but the kept ones.
 */
export function toSeriesChart(data: ChartSource): SeriesChart {
  const isFolded = data.columns.length > MAX_SERIES;
  const kept = isFolded ? MAX_SERIES - 1 : data.columns.length;
  const keptColumns = data.columns.slice(0, kept);
  const series: ChartSeries[] = keptColumns.map((column, index) => ({
    key: `s${index}`,
    label: headerLabel(column),
    slot: index,
  }));
  const totalHrefs: Record<string, string | null> = Object.fromEntries(
    keptColumns.map((_, c) => [`s${c}`, data.hrefs.columnTotals[c] ?? null]),
  );
  if (isFolded) {
    series.push({ key: `s${kept}`, label: OTHER_LABEL, slot: kept });
    totalHrefs[`s${kept}`] = foldedHref(data, 'columns', keptColumns);
  }

  const points = data.rows.map((row, r) => {
    const cells = data.cells[r] ?? [];
    const values: Record<string, number | null> = {};
    const hrefs: Record<string, string | null> = {};
    for (let c = 0; c < kept; c++) {
      values[`s${c}`] = cells[c] ?? null;
      hrefs[`s${c}`] = data.hrefs.cells[r]?.[c] ?? null;
    }
    if (isFolded) {
      values[`s${kept}`] = sumOrNull(cells.slice(kept));
      hrefs[`s${kept}`] = foldedHref(data, 'columns', keptColumns, {
        row: cellKey(data, 'rows', row),
      });
    }
    return { label: headerLabel(row), values, hrefs };
  });
  return { series, points, totalHrefs };
}

/** One donut slice: sized by magnitude, labelled with the signed value. */
export interface DonutSlice {
  label: string;
  value: number;
  signedValue: number;
  href: string | null;
  slot: number;
}

/**
 * Donut: the parts of the total along one axis: the rows, or the columns when the report has
 * a single row. Empty and zero parts are left out. Past eight parts, the seven largest stay in
 * their order and the rest fold into "Other".
 */
export function toDonutSlices(data: ChartSource): DonutSlice[] {
  const byRows = data.rows.length > 1 || data.columns.length <= 1;
  const headers = byRows ? data.rows : data.columns;
  const totals = byRows ? data.rowTotals : data.columnTotals;
  const hrefs = byRows ? data.hrefs.rowTotals : data.hrefs.columnTotals;
  const parts = headers
    .map((header, index) => ({
      header,
      label: headerLabel(header),
      signedValue: totals[index] ?? 0,
      href: hrefs[index] ?? null,
    }))
    .filter((part) => part.signedValue !== 0);

  let shown = parts;
  let rest: typeof parts = [];
  if (parts.length > MAX_SERIES) {
    const largest = new Set(
      [...parts]
        .sort((a, b) => Math.abs(b.signedValue) - Math.abs(a.signedValue))
        .slice(0, MAX_SERIES - 1),
    );
    shown = parts.filter((part) => largest.has(part));
    rest = parts.filter((part) => !largest.has(part));
  }
  const slices: DonutSlice[] = shown.map(({ label, signedValue, href }, slot) => ({
    label,
    value: Math.abs(signedValue),
    signedValue,
    href,
    slot,
  }));
  if (rest.length > 0) {
    const signedValue = rest.reduce((sum, part) => sum + part.signedValue, 0);
    slices.push({
      label: OTHER_LABEL,
      value: Math.abs(signedValue),
      signedValue,
      // Every part but the shown ones: the empty and zero parts add nothing to it.
      href: foldedHref(
        data,
        byRows ? 'rows' : 'columns',
        shown.map((part) => part.header),
      ),
      slot: slices.length,
    });
  }
  return slices;
}

/** Single number: the grand total, linking to every Transaction behind it. */
export function toSingleNumber(data: ChartSource): { value: number | null; href: string } {
  return { value: data.total, href: data.hrefs.total };
}

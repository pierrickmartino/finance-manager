import type { Measure, ReportHeader } from '@/server/services/reporting';

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
 * series. Columns past the eighth fold into one "Other" series, which links nowhere.
 */
export function toSeriesChart(data: ChartSource): SeriesChart {
  const isFolded = data.columns.length > MAX_SERIES;
  const kept = isFolded ? MAX_SERIES - 1 : data.columns.length;
  const series: ChartSeries[] = data.columns
    .slice(0, kept)
    .map((column, index) => ({ key: `s${index}`, label: headerLabel(column), slot: index }));
  if (isFolded) series.push({ key: `s${kept}`, label: OTHER_LABEL, slot: kept });

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
      hrefs[`s${kept}`] = null;
    }
    return { label: headerLabel(row), values, hrefs };
  });
  return { series, points };
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
  const slices = shown.map((part, slot) => ({
    ...part,
    value: Math.abs(part.signedValue),
    slot,
  }));
  if (rest.length > 0) {
    const signedValue = rest.reduce((sum, part) => sum + part.signedValue, 0);
    slices.push({
      label: OTHER_LABEL,
      value: Math.abs(signedValue),
      signedValue,
      href: null,
      slot: slices.length,
    });
  }
  return slices.map(({ label, value, signedValue, href, slot }) => ({
    label,
    value,
    signedValue,
    href,
    slot,
  }));
}

/** Single number: the grand total, linking to every Transaction behind it. */
export function toSingleNumber(data: ChartSource): { value: number | null; href: string } {
  return { value: data.total, href: data.hrefs.total };
}

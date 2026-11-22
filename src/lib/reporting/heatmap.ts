import type { Measure, ReportHeader } from '@/server/services/reporting';
import type { ChartSource, RowTree } from './chart-data';

/**
 * A table Widget on its Dashboard card: the engine's rows × columns grid as a heatmap, each
 * cell shaded by its size against the largest cell (ADR-0009's navy). Rows run largest total
 * first; every cell keeps its drill-down link. The component only draws what this returns.
 */

/**
 * The shades, lightest first: how much of `ramp-3` is mixed into the card's white. Stepped,
 * not continuous, so the text on each shade passes AA: ink up to the fourth step (≥ 4.6:1),
 * white from the fifth (≥ 5.3:1). Between those two a continuous shade would fail both.
 */
export const HEAT_LEVELS = [
  { mix: 8, isDark: false },
  { mix: 25, isDark: false },
  { mix: 42, isDark: false },
  { mix: 60, isDark: false },
  { mix: 80, isDark: true },
  { mix: 100, isDark: true },
] as const;

export interface HeatmapColumn {
  /** Short, for the narrow column head: "Oct" for "Oct 2026". */
  label: string;
  /** Every word, for the cells' accessible names. */
  fullLabel: string;
  isPartial: boolean;
}

export interface HeatmapCell {
  value: number;
  href: string;
  /** Index into HEAT_LEVELS. */
  level: number;
}

export interface HeatmapRow {
  /** The row's axis key (`none` for the "none" bucket): unique where labels may not be. */
  key: string;
  label: string;
  /** Null where no Transaction falls. */
  cells: (HeatmapCell | null)[];
  total: number | null;
  totalHref: string;
}

export interface Heatmap {
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
  /** A Total column is drawn only when there is more than one column to add up. */
  hasTotal: boolean;
  /** Whether the cells show their sign: only when the table mixes positive and negative. */
  isSigned: boolean;
}

const MONTH_LABEL = /^([A-Z][a-z]{2}) \d{4}$/;

function column(header: ReportHeader): HeatmapColumn {
  const fullLabel = header.isPartial ? `${header.label} (partial)` : header.label;
  const month = MONTH_LABEL.exec(header.label);
  return { label: month ? month[1]! : header.label, fullLabel, isPartial: header.isPartial };
}

/** The heat level for a size from 0 (none) to 1 (the largest cell). */
export function heatLevel(share: number): number {
  const last = HEAT_LEVELS.length - 1;
  return Math.min(last, Math.max(0, Math.ceil(share * HEAT_LEVELS.length) - 1));
}

/** The size every cell is shaded against: the largest of `rows` by magnitude. */
function largestCell(data: ChartSource, rows: readonly number[]): number {
  const values = rows.flatMap((r) => data.cells[r] ?? []);
  return Math.max(0, ...values.map((value) => Math.abs(value ?? 0)));
}

/** Row `r` of the source as a heatmap row, its cells shaded against `largest`. */
function heatRow(data: ChartSource, r: number, largest: number): HeatmapRow {
  return {
    key: data.rows[r]!.key ?? 'none',
    label: data.rows[r]!.label,
    cells: data.columns.map((_, c) => {
      const value = data.cells[r]?.[c] ?? null;
      if (value === null) return null;
      const share = largest === 0 ? 0 : Math.abs(value) / largest;
      return { value, href: data.hrefs.cells[r]![c]!, level: heatLevel(share) };
    }),
    total: data.rowTotals[r] ?? null,
    totalHref: data.hrefs.rowTotals[r]!,
  };
}

function isSignedSource(data: ChartSource): boolean {
  const values = data.cells.flat().filter((value): value is number => value !== null);
  return values.some((value) => value > 0) && values.some((value) => value < 0);
}

export function toHeatmap(data: ChartSource): Heatmap {
  const all = data.rows.map((_, r) => r);
  const largest = largestCell(data, all);
  const order = all.sort(
    (a, b) => Math.abs(data.rowTotals[b] ?? 0) - Math.abs(data.rowTotals[a] ?? 0),
  );
  return {
    columns: data.columns.map(column),
    rows: order.map((r) => heatRow(data, r, largest)),
    hasTotal: data.columns.length > 1,
    isSigned: isSignedSource(data),
  };
}

/** A child row of a tree heatmap: its own name to show, its whole label to be named by. */
export interface TreeHeatmapRow extends HeatmapRow {
  name: string;
}

export interface TreeHeatmapGroup {
  /** The group's subtotal: drawn plain, so it never drowns its children. */
  subtotal: HeatmapRow;
  children: TreeHeatmapRow[];
}

export interface TreeHeatmapSection {
  label: string;
  /** The sum of its group subtotals; null when none has a value. */
  total: number | null;
  groups: TreeHeatmapGroup[];
}

export interface TreeHeatmap {
  columns: HeatmapColumn[];
  sections: TreeHeatmapSection[];
  hasTotal: boolean;
  isSigned: boolean;
}

/**
 * A heatmap whose rows form a tree (Categories per period): the tree's order, not the largest
 * first, each child shaded against the largest child cell of its own section, so Expense is not
 * washed out by Income and no subtotal outweighs the Categories it adds up.
 */
export function toTreeHeatmap(data: ChartSource, tree: RowTree): TreeHeatmap {
  const sections = tree.sections.map((section) => {
    const children = section.groups.flatMap((group) => group.children.map((child) => child.row));
    const largest = largestCell(data, children);
    const totals = section.groups
      .map((group) => data.rowTotals[group.row] ?? null)
      .filter((total): total is number => total !== null);
    return {
      label: section.label,
      total: totals.length === 0 ? null : totals.reduce((sum, total) => sum + total, 0),
      groups: section.groups.map((group) => ({
        subtotal: heatRow(data, group.row, largest),
        children: group.children.map((child) => ({
          ...heatRow(data, child.row, largest),
          name: child.label,
        })),
      })),
    };
  });
  return {
    columns: data.columns.map(column),
    sections,
    hasTotal: data.columns.length > 1,
    isSigned: isSignedSource(data),
  };
}

/** A cell's short text: whole francs (or a count), in thousands from 1000. */
export function compactValue(value: number, measure: Measure, isSigned: boolean): string {
  const units = Math.abs(measure === 'count' ? value : value / 100);
  const text =
    units >= 1000 ? `${(Math.round(units / 100) / 10).toFixed(1)}k` : String(Math.round(units));
  return isSigned && value < 0 ? `−${text}` : text;
}

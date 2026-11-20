'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import type { ChartSource, RowTree } from '@/lib/reporting/chart-data';
import {
  compactValue,
  HEAT_LEVELS,
  toHeatmap,
  toTreeHeatmap,
  type HeatmapCell,
  type HeatmapColumn,
  type HeatmapRow,
  type TreeHeatmapGroup,
} from '@/lib/reporting/heatmap';

/**
 * A table Widget's card (docs/design-system.md, "Charts"): rows × columns as cells shaded in six
 * steps of `hero-mid`, each a link to its Transactions. Rows that form a tree (Analytics'
 * Categories per period) are drawn as one: a heading per type, each group a band of plain
 * subtotals, its Categories indented beneath it and shaded within their type.
 */

interface Text {
  /** Every digit, for names and tooltips. */
  full: (value: number) => string;
  /** Whole francs, in thousands from 1000, for the narrow cells. */
  compact: (value: number) => string;
}

function useText(data: ChartSource, isSigned: boolean): Text {
  const fmt = useFormatter();
  return {
    full: (value) =>
      data.measure === 'count' ? String(value) : fmt.amount(value, { currency: 'CHF' }),
    compact: (value) => compactValue(value, data.measure, isSigned),
  };
}

const shade = (mix: number) =>
  `color-mix(in srgb, var(--color-hero-mid) ${mix}%, var(--color-surface))`;

const PARTIAL_OUTLINE = 'outline-2 -outline-offset-2 outline-hero-deep outline-dashed';

function ColumnHeads({ columns, hasTotal }: { columns: HeatmapColumn[]; hasTotal: boolean }) {
  return (
    <thead>
      <tr>
        <td />
        {columns.map((column) => (
          <th
            key={column.fullLabel}
            scope="col"
            title={column.fullLabel}
            className="px-1 text-center font-normal text-muted"
          >
            {column.isPartial ? `${column.label}*` : column.label}
          </th>
        ))}
        {hasTotal && (
          <th scope="col" className="px-1 text-right font-normal text-muted">
            Total
          </th>
        )}
      </tr>
    </thead>
  );
}

interface CellProps {
  cell: HeatmapCell | null;
  column: HeatmapColumn;
  /** The row's whole label, for the cell's accessible name. */
  label: string;
  text: Text;
}

/** One shaded cell, a link to its Transactions; an empty, quiet one where nothing falls. */
function HeatCell({ cell, column, label, text }: CellProps) {
  if (!cell) return <td className="rounded-md bg-sunken/60" />;
  const level = HEAT_LEVELS[cell.level]!;
  return (
    <td className="p-0">
      <Link
        href={cell.href}
        aria-label={`${label}, ${column.fullLabel}: ${text.full(cell.value)}`}
        title={text.full(cell.value)}
        className={`block min-w-12 rounded-md px-1 py-2 text-center tabular-nums hover:ring-2 hover:ring-accent ${level.isDark ? 'text-on-hero' : 'text-ink'} ${column.isPartial ? PARTIAL_OUTLINE : ''}`}
        style={{ backgroundColor: shade(level.mix) }}
      >
        {text.compact(cell.value)}
      </Link>
    </td>
  );
}

/** A row's Total, the link to every Transaction behind it; a dash when it has none. */
function RowTotal({ row, text, className }: { row: HeatmapRow; text: Text; className: string }) {
  return (
    <td className={`pl-2 text-right whitespace-nowrap tabular-nums ${className}`}>
      {row.total === null ? (
        <span className="text-faint">—</span>
      ) : (
        <Link href={row.totalHref} className="hover:underline">
          {text.full(row.total)}
        </Link>
      )}
    </td>
  );
}

function HeatScale() {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {HEAT_LEVELS.map((level) => (
        <span
          key={level.mix}
          className="h-2 w-3 rounded-sm"
          style={{ backgroundColor: shade(level.mix) }}
        />
      ))}
    </span>
  );
}

const partialNote = (columns: HeatmapColumn[]) =>
  columns.some((column) => column.isPartial) ? ' · * dashed: period still running' : '';

export function HeatmapGrid({ data }: { data: ChartSource }) {
  return data.rowTree ? (
    <TreeHeatmapGrid data={data} tree={data.rowTree} />
  ) : (
    <RankedHeatmapGrid data={data} />
  );
}

/** Rows ranked by their total, largest first, every cell shaded against the largest. */
function RankedHeatmapGrid({ data }: { data: ChartSource }) {
  const map = toHeatmap(data);
  const text = useText(data, map.isSigned);
  return (
    <figure className="min-h-0 overflow-x-auto">
      <table aria-label="Heatmap" className="w-full border-separate border-spacing-1 text-xs">
        <ColumnHeads columns={map.columns} hasTotal={map.hasTotal} />
        <tbody>
          {map.rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                title={row.label}
                className="max-w-40 truncate pr-2 text-left font-medium"
              >
                {row.label}
              </th>
              {row.cells.map((cell, c) => (
                <HeatCell
                  key={map.columns[c]!.fullLabel}
                  cell={cell}
                  column={map.columns[c]!}
                  label={row.label}
                  text={text}
                />
              ))}
              {map.hasTotal && <RowTotal row={row} text={text} className="font-semibold" />}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted">
        <HeatScale />
        Darker is larger{partialNote(map.columns)}
      </figcaption>
    </figure>
  );
}

/** Rows as their tree: a heading per section, each group's subtotal band over its children. */
function TreeHeatmapGrid({ data, tree }: { data: ChartSource; tree: RowTree }) {
  const map = toTreeHeatmap(data, tree);
  const text = useText(data, map.isSigned);
  const span = map.columns.length + (map.hasTotal ? 2 : 1);
  return (
    <figure className="min-h-0 overflow-x-auto">
      <table
        aria-label="Heatmap"
        className="w-full border-separate border-spacing-x-1 border-spacing-y-0.5 text-xs"
      >
        <ColumnHeads columns={map.columns} hasTotal={map.hasTotal} />
        {map.sections.map((section) => (
          <tbody key={section.label}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={span}
                className="border-b border-rule pt-4 pb-1 text-left font-medium text-muted"
              >
                {section.label}
                {section.total !== null && (
                  <span className="ml-2 tabular-nums">{text.full(section.total)}</span>
                )}
              </th>
            </tr>
            {section.groups.map((group) => (
              <GroupRows
                key={group.subtotal.key}
                group={group}
                columns={map.columns}
                hasTotal={map.hasTotal}
                text={text}
              />
            ))}
          </tbody>
        ))}
      </table>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="h-2 w-5 rounded-sm bg-sunken ring-1 ring-rule" aria-hidden />
        Group subtotal
        <span className="ml-2">
          <HeatScale />
        </span>
        Category: darker is larger within its type{partialNote(map.columns)}
      </figcaption>
    </figure>
  );
}

interface GroupRowsProps {
  group: TreeHeatmapGroup;
  columns: HeatmapColumn[];
  hasTotal: boolean;
  text: Text;
}

/**
 * A group's subtotal as a sunken band of plain bold figures, so it never outweighs what it adds
 * up, then its Categories on a tree line, each named in full for assistive technology.
 */
function GroupRows({ group, columns, hasTotal, text }: GroupRowsProps) {
  const { subtotal, children } = group;
  return (
    <>
      <tr className="bg-sunken">
        <th
          scope="row"
          title={subtotal.label}
          className="max-w-48 truncate rounded-l-md px-2 py-1.5 text-left text-sm font-semibold"
        >
          {subtotal.label}
        </th>
        {subtotal.cells.map((cell, c) => {
          const column = columns[c]!;
          return (
            <td
              key={column.fullLabel}
              className={`rounded-md px-1 py-1.5 text-center font-semibold tabular-nums ${column.isPartial ? PARTIAL_OUTLINE : ''}`}
            >
              {cell === null ? (
                <span className="text-faint">—</span>
              ) : (
                <Link
                  href={cell.href}
                  aria-label={`${subtotal.label}, ${column.fullLabel}: ${text.full(cell.value)}`}
                  title={text.full(cell.value)}
                  className="hover:underline"
                >
                  {text.compact(cell.value)}
                </Link>
              )}
            </td>
          );
        })}
        {hasTotal && (
          <RowTotal
            row={subtotal}
            text={text}
            className="rounded-r-md pr-2 text-sm font-semibold"
          />
        )}
      </tr>
      {children.map((child, i) => (
        <tr key={child.key}>
          <th scope="row" title={child.label} className="max-w-48 text-left font-normal">
            <span className="flex items-stretch">
              <span
                aria-hidden
                className={`ml-3 w-3 shrink-0 border-l border-rule-strong ${i === children.length - 1 ? 'h-1/2 self-start' : ''}`}
              >
                <span className="mt-[0.9rem] block border-t border-rule-strong" />
              </span>
              <span className="truncate py-1.5 pl-1 text-ink-soft">
                <span className="sr-only">{subtotal.label} › </span>
                {child.name}
              </span>
            </span>
          </th>
          {child.cells.map((cell, c) => (
            <HeatCell
              key={columns[c]!.fullLabel}
              cell={cell}
              column={columns[c]!}
              label={child.label}
              text={text}
            />
          ))}
          {hasTotal && <RowTotal row={child} text={text} className="text-ink-soft" />}
        </tr>
      ))}
    </>
  );
}

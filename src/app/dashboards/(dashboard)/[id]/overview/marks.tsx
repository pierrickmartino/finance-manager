'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { compactValue, HEAT_LEVELS, toHeatmap } from '@/lib/reporting/heatmap';
import {
  latestFullIndex,
  type LineMarker,
  type MonthFlow,
  type PeriodValue,
  type TickItem,
} from '@/lib/reporting/card';
import { litTicks } from '@/lib/reporting/overview';

/**
 * The marks the Dashboard's cards draw (docs/design-system.md, "Dashboard"): in the hero's navy,
 * with the latest full period hatched. Amounts in minor units, shown in CHF.
 */

function useMoney(): (minor: number) => string {
  const fmt = useFormatter();
  return (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
}

/** "Oct 2026" → "Oct": axis labels keep only the month. */
const shortLabel = (label: string): string => label.split(' ')[0] ?? label;

const DOT_LEVELS = 9;

function DotColumn({ value, max, tone }: { value: number; max: number; tone: string }) {
  const lit = value <= 0 ? 0 : Math.max(1, Math.round((value / max) * DOT_LEVELS));
  return (
    <div className="flex flex-col-reverse gap-1">
      {Array.from({ length: DOT_LEVELS }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < lit ? tone : 'bg-sunken'}`}
          // The top of each column reads darkest, like the inspiration's dot matrix.
          style={i < lit ? { opacity: 0.45 + (0.55 * (i + 1)) / lit } : undefined}
        />
      ))}
    </div>
  );
}

/** Each period a pair of dot columns: what came in (deep navy) and what went out (light). */
export function DotMatrix({ months }: { months: MonthFlow[] }) {
  const money = useMoney();
  const max = Math.max(1, ...months.flatMap((month) => [month.income, month.expense]));
  return (
    <figure>
      <div className="flex items-end justify-between gap-1">
        {months.map((month) => (
          <div
            key={month.label}
            className="flex gap-0.5"
            title={`${month.label}: in ${money(month.income)}, out ${money(month.expense)}`}
          >
            <DotColumn value={month.income} max={max} tone="bg-hero-deep" />
            <DotColumn value={month.expense} max={max} tone="bg-hero-glow" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted" aria-hidden>
        {months.map((month, i) => (
          <span key={month.label} className="w-0 flex-1 text-center">
            {i % 2 === 0 ? shortLabel(month.label) : ''}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-hero-deep" /> In
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-hero-glow" /> Out
        </span>
      </figcaption>
    </figure>
  );
}

/** How many periods the bars show: the latest half year reads at a glance. */
const BAR_PERIODS = 6;

function barTone(period: PeriodValue, index: number, isMarked: boolean): string {
  if (isMarked) return 'bg-hatch';
  if (period.value < 0) return 'bg-negative-tint';
  return index % 2 ? 'bg-hero-mist/50' : 'bg-sunken';
}

/** The latest periods as rounded bars, the latest full one hatched and labelled. */
export function MonthBars({ periods }: { periods: PeriodValue[] }) {
  const money = useMoney();
  const shown = periods.slice(-BAR_PERIODS);
  const marked = latestFullIndex(shown);
  const max = Math.max(1, ...shown.map((period) => Math.abs(period.value)));
  return (
    <div className="flex h-52 items-end gap-3 pt-8">
      {shown.map((period, i) => (
        <Link
          key={period.label}
          href={period.href}
          aria-label={`${period.label}: ${money(period.value)}`}
          className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
        >
          <span className="relative flex w-full flex-1 items-end">
            {i === marked && (
              <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper">
                {money(period.value)}
              </span>
            )}
            <span
              className={`w-full rounded-xl group-hover:opacity-80 ${barTone(period, i, i === marked)}`}
              style={{ height: `${Math.max(4, (Math.abs(period.value) / max) * 100)}%` }}
            />
          </span>
          <span className="text-xs text-muted">{shortLabel(period.label)}</span>
        </Link>
      ))}
    </div>
  );
}

/** Where each point sits in the line's box, in percent: x across, y down from the top. */
function linePositions(values: number[]): { x: number; y: number }[] {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;
  const step = values.length > 1 ? 100 / (values.length - 1) : 0;
  return values.map((value, i) => ({
    x: values.length > 1 ? i * step : 50,
    y: 100 - ((value - low) / span) * 100,
  }));
}

/**
 * A chart with nothing to draw: an empty plot over its baseline, the sentence saying why in
 * its middle.
 */
export function EmptyChart({ sentence }: { sentence: string }) {
  return (
    <figure className="relative flex h-40 items-center justify-center border-b border-rule">
      <figcaption className="px-4 text-center text-sm text-muted">{sentence}</figcaption>
    </figure>
  );
}

/** Where a marker `at` points along the line sits: between the two points either side of it. */
function alongLine(positions: { x: number; y: number }[], at: number): { x: number; y: number } {
  const before = Math.min(Math.floor(at), positions.length - 1);
  const after = Math.min(before + 1, positions.length - 1);
  const through = at - before;
  const [from, to] = [positions[before]!, positions[after]!];
  return { x: from.x + (to.x - from.x) * through, y: from.y + (to.y - from.y) * through };
}

/** A Capital movement on the line: an amber diamond that opens its Transaction. */
function CapitalMarkerLink({ marker, x, y }: { marker: LineMarker; x: number; y: number }) {
  return (
    <Link
      href={marker.href}
      aria-label={`Capital movement on ${marker.date}: ${marker.title}`}
      title={`${marker.date} · ${marker.title}`}
      className="group absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="h-2.5 w-2.5 rotate-45 border border-accent-ink bg-accent group-hover:scale-125" />
    </Link>
  );
}

/**
 * Net worth over time: one navy line from zero up (or down), a dot per period that opens the
 * Accounts as of its last day, the latest point labelled; a running period's dot is hollow.
 * Capital movements sit on the line at their dates as amber diamonds.
 */
export function NetWorthLine({
  points,
  markers = [],
}: {
  points: PeriodValue[];
  markers?: LineMarker[];
}) {
  const money = useMoney();
  const positions = linePositions(points.map((point) => point.value));
  const values = points.map((point) => point.value);
  const zeroY = linePositions([...values, 0]).at(-1)!.y;
  const latest = points.length - 1;
  return (
    <figure>
      <div className="relative mx-2 mt-8 h-40">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible text-hero-deep"
          aria-hidden
        >
          <line
            x1={0}
            x2={100}
            y1={zeroY}
            y2={zeroY}
            className="stroke-rule"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={positions.map(({ x, y }) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {points.map((point, i) => (
          <Link
            key={point.label}
            href={point.href}
            aria-label={`${point.label}: ${money(point.value)}`}
            title={`${point.label}: ${money(point.value)}`}
            className="group absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${positions[i]!.x}%`, top: `${positions[i]!.y}%` }}
          >
            {i === latest && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper">
                {money(point.value)}
              </span>
            )}
            <span
              className={`h-2.5 w-2.5 rounded-full border-2 border-hero-deep group-hover:scale-125 ${
                point.isPartial ? 'bg-surface' : 'bg-hero-deep'
              }`}
            />
          </Link>
        ))}
        {markers.map((marker, i) => (
          <CapitalMarkerLink
            key={`${marker.href}-${i}`}
            marker={marker}
            {...alongLine(positions, marker.at)}
          />
        ))}
      </div>
      {points.length > 0 && (
        <div className="mt-3 flex justify-between text-xs text-muted" aria-hidden>
          <span>{points[0]!.label}</span>
          {points.length > 1 && <span>{points[latest]!.label}</span>}
        </div>
      )}
    </figure>
  );
}

const TICKS = 12;

/** Parts of a whole, largest first: each a row with a bar of ticks and its share. */
export function TickList({ items }: { items: TickItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const lit = litTicks(item.share, TICKS);
        const row = (
          <span className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl bg-paper px-4 py-3 hover:bg-sunken">
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted">{item.detail}</span>
            </span>
            <span className="flex gap-0.5" aria-hidden>
              {Array.from({ length: TICKS }, (_, i) => (
                <span
                  key={i}
                  className={`h-4 w-1.5 rounded-sm ${i < lit ? 'bg-hero-mid' : 'bg-rule'}`}
                />
              ))}
            </span>
            <span className="w-10 text-right text-sm tabular-nums">
              {Math.round(item.share * 100)}%
            </span>
          </span>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A table Widget's rows × columns as cells shaded by size, each a link to its Transactions. */
export function HeatmapGrid({ data }: { data: ChartSource }) {
  const fmt = useFormatter();
  const full = (value: number) =>
    data.measure === 'count' ? String(value) : fmt.amount(value, { currency: 'CHF' });
  const map = toHeatmap(data);
  return (
    <figure className="min-h-0 overflow-x-auto">
      <table aria-label="Heatmap" className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <td />
            {map.columns.map((column) => (
              <th
                key={column.fullLabel}
                scope="col"
                title={column.fullLabel}
                className="px-1 text-center font-normal text-muted"
              >
                {column.isPartial ? `${column.label}*` : column.label}
              </th>
            ))}
            {map.hasTotal && (
              <th scope="col" className="px-1 text-right font-normal text-muted">
                Total
              </th>
            )}
          </tr>
        </thead>
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
              {row.cells.map((cell, c) => {
                const column = map.columns[c]!;
                if (!cell) return <td key={column.fullLabel} className="rounded-md bg-sunken/60" />;
                const level = HEAT_LEVELS[cell.level]!;
                return (
                  <td key={column.fullLabel} className="p-0">
                    <Link
                      href={cell.href}
                      aria-label={`${row.label}, ${column.fullLabel}: ${full(cell.value)}`}
                      title={full(cell.value)}
                      className={`block min-w-12 rounded-md px-1 py-2 text-center tabular-nums hover:ring-2 hover:ring-accent ${level.isDark ? 'text-on-hero' : 'text-ink'} ${column.isPartial ? 'outline-2 -outline-offset-2 outline-hero-deep outline-dashed' : ''}`}
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--color-hero-mid) ${level.mix}%, var(--color-surface))`,
                      }}
                    >
                      {compactValue(cell.value, data.measure, map.isSigned)}
                    </Link>
                  </td>
                );
              })}
              {map.hasTotal && (
                <td className="pl-2 text-right font-semibold whitespace-nowrap tabular-nums">
                  {row.total === null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <Link href={row.totalHref} className="hover:underline">
                      {full(row.total)}
                    </Link>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span className="flex gap-0.5" aria-hidden>
          {HEAT_LEVELS.map((level) => (
            <span
              key={level.mix}
              className="h-2 w-3 rounded-sm"
              style={{
                backgroundColor: `color-mix(in srgb, var(--color-hero-mid) ${level.mix}%, var(--color-surface))`,
              }}
            />
          ))}
        </span>
        Darker is larger
        {map.columns.some((column) => column.isPartial) && ' · * dashed: period still running'}
      </figcaption>
    </figure>
  );
}

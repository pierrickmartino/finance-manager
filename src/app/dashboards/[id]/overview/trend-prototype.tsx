'use client';

/**
 * PROTOTYPE ONLY: throwaway, not for main. Question: what should a "line" Widget's card look
 * like on the Dashboard? Four variants of the trend card body, switchable via `?variant=` on the
 * existing /dashboards/[id] route; `current` is today's dots/bars for comparison.
 * No tests, no polish: pick a winner, then rewrite it properly.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { PrototypeSwitcher, type PrototypeVariant } from '@/components/prototype-switcher';
import { toSeriesChart, type ChartSource } from '@/lib/reporting/chart-data';
import { CHART_PALETTE } from '../../chart-palette';

export const TREND_VARIANTS: readonly PrototypeVariant[] = [
  { key: 'A', name: 'Focus line' },
  { key: 'B', name: 'Series ledger' },
  { key: 'C', name: 'Then vs now' },
  { key: 'D', name: 'Dot line' },
  { key: 'current', name: 'Today: dots / bars' },
];

/** The floating bar, mounted once by the Dashboard page. */
export function TrendPrototypeSwitcher() {
  return <PrototypeSwitcher variants={TREND_VARIANTS} />;
}

// Data ----------------------------------------------------------------------------------------

interface TrendSeries {
  key: string;
  label: string;
  slot: number;
  values: (number | null)[];
  hrefs: (string | null)[];
}

interface Trend {
  labels: string[];
  short: string[];
  partial: boolean[];
  series: TrendSeries[];
  /** Every value was ≤ 0 (spending): the marks draw magnitudes, so "up" means more. */
  isFlipped: boolean;
  /** Index of the latest period that is over (-1: none). */
  latestFull: number;
}

function toTrend(data: ChartSource): Trend {
  const chart = toSeriesChart(data);
  let series: TrendSeries[] = chart.series.map((s) => ({
    ...s,
    values: chart.points.map((p) => p.values[s.key] ?? null),
    hrefs: chart.points.map((p) => p.hrefs[s.key] ?? null),
  }));
  if (series.length === 0) {
    series = [
      {
        key: 'total',
        label: 'Total',
        slot: 0,
        values: data.rowTotals,
        hrefs: data.hrefs.rowTotals,
      },
    ];
  }
  const isFlipped = series.every((s) => s.values.every((v) => (v ?? 0) <= 0));
  if (isFlipped) {
    series = series.map((s) => ({ ...s, values: s.values.map((v) => (v === null ? null : -v)) }));
  }
  const partial = data.rows.map((row) => row.isPartial);
  return {
    labels: data.rows.map((row) => row.label),
    short: data.rows.map((row) => row.label.split(' ')[0] ?? row.label),
    partial,
    series,
    isFlipped,
    latestFull: partial.findLastIndex((p) => !p),
  };
}

function useMoney(isFlipped: boolean) {
  const fmt = useFormatter();
  return (v: number) => fmt.amount(isFlipped ? -v : v, { currency: 'CHF', isWhole: true });
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function extent(values: number[], withZero: boolean): [number, number] {
  const lo = Math.min(...values, ...(withZero ? [0] : []));
  const hi = Math.max(...values, ...(withZero ? [0] : []));
  return hi === lo ? [lo - 1, hi + 1] : [lo, hi];
}

function path(points: ({ x: number; y: number } | null)[]): string {
  let d = '';
  let isOpen = false;
  for (const p of points) {
    if (!p) {
      isOpen = false;
      continue;
    }
    d += `${isOpen ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    isOpen = true;
  }
  return d;
}

const pct = (from: number, to: number): string | null =>
  from === 0 ? null : `${to >= from ? '+' : '−'}${Math.round(Math.abs((to - from) / from) * 100)}%`;

// Variant A: one series in focus, as an area line you scrub ----------------------------------

const A_HEIGHT = 190;
const A_PAD = { top: 34, right: 18, bottom: 22, left: 12 };

function VariantA({ trend }: { trend: Trend }) {
  const router = useRouter();
  const money = useMoney(trend.isFlipped);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [focusKey, setFocusKey] = useState(trend.series[0]!.key);
  const [hover, setHover] = useState<number | null>(null);
  const focus = trend.series.find((s) => s.key === focusKey) ?? trend.series[0]!;
  const all = trend.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const [lo, hi] = extent(all, true);
  const n = trend.labels.length;
  const innerW = Math.max(1, width - A_PAD.left - A_PAD.right);
  const x = (i: number) => A_PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) =>
    A_PAD.top + (1 - (v - lo) / (hi - lo)) * (A_HEIGHT - A_PAD.top - A_PAD.bottom);
  const at = (s: TrendSeries) => s.values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) }));
  const shown = hover ?? trend.latestFull;
  const pts = at(focus);
  const lastFull = trend.latestFull;
  const solid = pts.map((p, i) => (i <= Math.max(lastFull, 0) ? p : null));
  const dashed = pts.map((p, i) => (i >= Math.max(lastFull, 0) ? p : null));
  const area =
    path(solid) && lastFull > 0
      ? `${path(solid)} L${x(lastFull)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`
      : '';
  const value = shown >= 0 ? (focus.values[shown] ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      {trend.series.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {trend.series.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setFocusKey(s.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                s.key === focus.key
                  ? 'bg-hero-deep text-on-hero'
                  : 'bg-sunken text-ink-soft hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={A_HEIGHT}
            className="block"
            onMouseMove={(e) => {
              const left = e.currentTarget.getBoundingClientRect().left;
              const i = Math.round(((e.clientX - left - A_PAD.left) / innerW) * (n - 1));
              setHover(Math.min(n - 1, Math.max(0, i)));
            }}
            onClick={() => {
              const href = shown >= 0 ? focus.hrefs[shown] : null;
              if (href) router.push(href);
            }}
            style={{ cursor: 'pointer' }}
            aria-label={`${focus.label} over ${n} periods`}
          >
            <defs>
              <linearGradient id={`fade-${focus.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-hero-glow)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-hero-glow)" stopOpacity={0} />
              </linearGradient>
              <pattern
                id="proto-hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="3" height="6" fill="var(--color-hero-mist)" opacity={0.5} />
              </pattern>
            </defs>
            {lastFull >= 0 && n > 1 && (
              <rect
                x={x(lastFull) - innerW / (n - 1) / 2}
                width={innerW / (n - 1)}
                y={A_PAD.top - 6}
                height={A_HEIGHT - A_PAD.top - A_PAD.bottom + 6}
                fill="url(#proto-hatch)"
                rx={6}
              />
            )}
            {lo < 0 && (
              <line
                x1={A_PAD.left}
                x2={width - A_PAD.right}
                y1={y(0)}
                y2={y(0)}
                className="stroke-rule-strong"
                strokeDasharray="2 3"
              />
            )}
            {trend.series
              .filter((s) => s.key !== focus.key)
              .map((s) => (
                <path
                  key={s.key}
                  d={path(at(s))}
                  fill="none"
                  className="stroke-rule-strong"
                  strokeWidth={1.5}
                />
              ))}
            <path d={area} fill={`url(#fade-${focus.key})`} />
            <path
              d={path(solid)}
              fill="none"
              className="stroke-hero-mid"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={path(dashed)}
              fill="none"
              className="stroke-hero-glow"
              strokeWidth={2}
              strokeDasharray="3 4"
            />
            {shown >= 0 && pts[shown] && (
              <>
                <line
                  x1={pts[shown]!.x}
                  x2={pts[shown]!.x}
                  y1={A_PAD.top - 6}
                  y2={A_HEIGHT - A_PAD.bottom}
                  className="stroke-hero-deep"
                  strokeOpacity={0.25}
                />
                <circle
                  cx={pts[shown]!.x}
                  cy={pts[shown]!.y}
                  r={9}
                  className="fill-hero-mist"
                  opacity={0.6}
                />
                <circle cx={pts[shown]!.x} cy={pts[shown]!.y} r={4.5} className="fill-hero-deep" />
              </>
            )}
            {trend.short.map((label, i) =>
              i % 2 === (n - 1) % 2 ? (
                <text
                  key={i}
                  x={x(i)}
                  y={A_HEIGHT - 4}
                  textAnchor="middle"
                  className="fill-muted text-[11px]"
                >
                  {label}
                </text>
              ) : null,
            )}
          </svg>
        )}
        {width > 0 && shown >= 0 && value !== null && pts[shown] && (
          <span
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper tabular-nums"
            style={{ left: Math.min(width - 60, Math.max(60, pts[shown]!.x)) }}
          >
            {trend.labels[shown]} · {money(value)}
          </span>
        )}
      </div>
    </div>
  );
}

// Variant B: one row per series, with its latest value, its change and its own sparkline ----

function Spark({ values, w = 120, h = 34 }: { values: (number | null)[]; w?: number; h?: number }) {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return <span style={{ width: w }} />;
  const [lo, hi] = extent(present, false);
  const x = (i: number) => 3 + (i / (values.length - 1)) * (w - 6);
  const y = (v: number) => 3 + (1 - (v - lo) / (hi - lo)) * (h - 6);
  const pts = values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) }));
  const last = pts.findLast((p) => p !== null)!;
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <path
        d={path(pts)}
        fill="none"
        className="stroke-hero-mid"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={3} className="fill-hero-deep" />
    </svg>
  );
}

function VariantB({ trend }: { trend: Trend }) {
  const money = useMoney(trend.isFlipped);
  const i = trend.latestFull;
  const prev = i - 1;
  const rows = [...trend.series].sort(
    (a, b) => Math.abs(b.values[i] ?? 0) - Math.abs(a.values[i] ?? 0),
  );
  const single = trend.series.length === 1 ? trend.series[0]! : null;
  const stats = single
    ? (() => {
        const v = single.values.filter((x): x is number => x !== null);
        return [
          ['Lowest', Math.min(...v)],
          ['Average', v.reduce((t, x) => t + x, 0) / v.length],
          ['Highest', Math.max(...v)],
        ] as const;
      })()
    : null;
  if (i < 0) return <p className="text-sm text-muted">No full period yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        {trend.labels[i]} vs {prev >= 0 ? trend.short[prev] : '—'} · {trend.short[0]}–
        {trend.short[i]} trend
      </p>
      <ul className="flex flex-col divide-y divide-rule">
        {rows.map((s) => {
          const now = s.values[i] ?? 0;
          const before = prev >= 0 ? (s.values[prev] ?? 0) : null;
          const change = before === null ? null : pct(before, now);
          const row = (
            <span className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5">
              <span className="min-w-20">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {change ? `${change} vs ${trend.short[prev]}` : 'no earlier period'}
                </span>
              </span>
              <Spark
                values={s.values.slice(0, i + 1)}
                w={single ? 200 : 120}
                h={single ? 56 : 34}
              />
              <span
                className={`text-right tabular-nums ${single ? 'font-display text-2xl' : 'text-sm font-medium'}`}
              >
                {money(now)}
              </span>
            </span>
          );
          const href = s.hrefs[i];
          return (
            <li key={s.key}>
              {href ? (
                <Link href={href} className="block rounded-lg hover:bg-sunken">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {stats && (
        <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-paper p-3">
          {stats.map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-sm tabular-nums">{money(Math.round(v))}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// Variant C: slope chart, first full period vs latest full period ------------------------------

const C_HEIGHT = 200;
const C_GAP = 15;

/** Pushes label positions apart so they never overlap. */
function spread(ys: number[]): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    order[k]!.y = Math.max(order[k]!.y, order[k - 1]!.y + C_GAP);
  }
  const out: number[] = [];
  for (const o of order) out[o.i] = o.y;
  return out;
}

function VariantC({ trend }: { trend: Trend }) {
  const money = useMoney(trend.isFlipped);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const first = trend.partial.findIndex((p) => !p);
  const last = trend.latestFull;
  if (first < 0 || last <= first)
    return <p className="text-sm text-muted">Needs two full periods.</p>;
  const from = trend.series.map((s) => s.values[first] ?? 0);
  const to = trend.series.map((s) => s.values[last] ?? 0);
  const [lo, hi] = extent([...from, ...to], false);
  const y = (v: number) => 18 + (1 - (v - lo) / (hi - lo)) * (C_HEIGHT - 36);
  const left = 96;
  const right = Math.max(left + 60, width - 190);
  const ly = spread(from.map(y));
  const ry = spread(to.map(y));
  return (
    <div ref={ref} className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted">
        <span>{trend.labels[first]}</span>
        <span>{trend.labels[last]}</span>
      </div>
      {width > 0 && (
        <svg width={width} height={C_HEIGHT} className="block" onMouseLeave={() => setActive(null)}>
          <line x1={left} x2={left} y1={8} y2={C_HEIGHT - 8} className="stroke-rule" />
          <line x1={right} x2={right} y1={8} y2={C_HEIGHT - 8} className="stroke-rule" />
          {trend.series.map((s, k) => {
            const isDim = active !== null && active !== s.key;
            const isUp = to[k]! >= from[k]!;
            return (
              <g
                key={s.key}
                onMouseEnter={() => setActive(s.key)}
                opacity={isDim ? 0.2 : 1}
                style={{ transition: 'opacity 120ms' }}
              >
                <line
                  x1={left}
                  y1={y(from[k]!)}
                  x2={right}
                  y2={y(to[k]!)}
                  className={isUp ? 'stroke-hero-deep' : 'stroke-hero-glow'}
                  strokeWidth={active === s.key ? 3 : 2}
                />
                <circle
                  cx={left}
                  cy={y(from[k]!)}
                  r={4}
                  className="fill-surface stroke-hero-mid"
                  strokeWidth={2}
                />
                <circle cx={right} cy={y(to[k]!)} r={4.5} className="fill-hero-deep" />
                <text
                  x={left - 10}
                  y={ly[k]! + 4}
                  textAnchor="end"
                  className="fill-muted text-[11px] tabular-nums"
                >
                  {money(from[k]!)}
                </text>
                <text x={right + 10} y={ry[k]! + 4} className="fill-ink text-[11px] tabular-nums">
                  <tspan className="font-medium">{money(to[k]!)}</tspan>
                  <tspan className="fill-muted"> {pct(from[k]!, to[k]!) ?? ''}</tspan>
                  {trend.series.length > 1 && <tspan className="fill-muted"> · {s.label}</tspan>}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// Variant D: the dot matrix, as a line: one lit dot per period per series ---------------------

const D_LEVELS = 11;

function VariantD({ trend }: { trend: Trend }) {
  const money = useMoney(trend.isFlipped);
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = trend.labels.length;
  const all = trend.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const [lo, hi] = extent(all, true);
  const cell = Math.min(44, (width - 24) / n);
  const h = D_LEVELS * 14 + 8;
  const cx = (i: number) => 4 + cell * (i + 0.5) + (width - 8 - cell * n) / 2;
  const level = (v: number) => Math.round(((v - lo) / (hi - lo)) * (D_LEVELS - 1));
  const cy = (l: number) => h - 8 - l * 14;
  const color = (slot: number) =>
    trend.series.length === 1 ? 'var(--color-hero-deep)' : CHART_PALETTE.series[slot]!;
  return (
    <figure ref={ref}>
      {width > 0 && (
        <svg width={width} height={h + 18} className="block">
          {trend.labels.map((label, i) =>
            Array.from({ length: D_LEVELS }, (_, l) => (
              <circle key={`${i}-${l}`} cx={cx(i)} cy={cy(l)} r={3} className="fill-sunken" />
            )),
          )}
          {lo < 0 && (
            <text
              x={cx(0) - cell / 2 - 4}
              textAnchor="end"
              y={cy(level(0)) + 3}
              className="fill-faint text-[9px]"
            >
              0
            </text>
          )}
          {trend.series.map((s) => {
            const pts = s.values.map((v, i) => (v === null ? null : { x: cx(i), y: cy(level(v)) }));
            return (
              <g key={s.key}>
                <path
                  d={path(pts)}
                  fill="none"
                  stroke={color(s.slot)}
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                />
                {pts.map((p, i) =>
                  p ? (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={trend.partial[i] ? 3 : 4}
                      fill={trend.partial[i] ? 'var(--color-surface)' : color(s.slot)}
                      stroke={color(s.slot)}
                      strokeWidth={1.5}
                    >
                      <title>{`${s.label} · ${trend.labels[i]}: ${money(s.values[i]!)}`}</title>
                    </circle>
                  ) : null,
                )}
              </g>
            );
          })}
          {trend.short.map((label, i) =>
            i % 2 === (n - 1) % 2 ? (
              <text
                key={i}
                x={cx(i)}
                y={h + 14}
                textAnchor="middle"
                className="fill-muted text-[11px]"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {trend.series.length > 1 && (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {trend.series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: color(s.slot) }} />{' '}
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

// Switch ---------------------------------------------------------------------------------------

/** The card body for the chosen variant, or null for `current` (today's dots/bars). */
export function TrendPrototype({
  variant,
  data,
}: {
  variant: string;
  data: ChartSource;
}): ReactNode {
  if (variant === 'current') return null;
  const trend = toTrend(data);
  if (variant === 'A') return <VariantA trend={trend} />;
  if (variant === 'B') return <VariantB trend={trend} />;
  if (variant === 'C') return <VariantC trend={trend} />;
  return <VariantD trend={trend} />;
}

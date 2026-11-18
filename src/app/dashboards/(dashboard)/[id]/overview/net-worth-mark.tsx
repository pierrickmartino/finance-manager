'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import type { NetWorthBand, PeriodValue } from '@/lib/reporting/card';

/**
 * The Net worth card's mark (docs/design-system.md, "Dashboard"): a band per Account kind,
 * current, savings and 3a stacked above zero and loans below, under the navy Net worth line.
 * Amounts in minor units, shown in CHF.
 */

/** Each kind's fill; a loan, below zero, is debt. */
const BAND_TONES: Record<string, { fill: string; dot: string; swatch: string }> = {
  current: { fill: 'fill-hero-mid', dot: 'bg-hero-mid', swatch: 'bg-hero-mid' },
  savings: { fill: 'fill-hero-glow', dot: 'bg-hero-glow', swatch: 'bg-hero-glow' },
  '3a': { fill: 'fill-hero-mist', dot: 'bg-hero-mist', swatch: 'bg-hero-mist' },
  loan: { fill: 'fill-negative-tint', dot: 'bg-negative', swatch: 'bg-negative-tint' },
};
const OTHER_TONE = { fill: 'fill-rule-strong', dot: 'bg-faint', swatch: 'bg-rule-strong' };
const toneOf = (band: NetWorthBand) => BAND_TONES[band.key] ?? OTHER_TONE;

/** A loan is tracked by Balance snapshots: it holds flat until the next point, then steps. */
const isStepped = (band: NetWorthBand): boolean => band.key === 'loan';

/** Where a band sits at one point: from `low` to `high`, in money. */
interface Span {
  low: number;
  high: number;
}

/** Each band's span per point: positive values stack up from zero, negative ones down. */
function stackBands(bands: NetWorthBand[]): Span[][] {
  const count = bands[0]?.points.length ?? 0;
  const above = Array.from({ length: count }, () => 0);
  const below = Array.from({ length: count }, () => 0);
  return bands.map((band) =>
    band.points.map(({ value }, i) => {
      const base = value >= 0 ? above[i]! : below[i]!;
      if (value >= 0) above[i] = base + value;
      else below[i] = base + value;
      return { low: Math.min(base, base + value), high: Math.max(base, base + value) };
    }),
  );
}

/** Maps money and point index into the box, in percent: x across, y down from the top. */
function scaleOf(count: number, values: number[]) {
  const low = Math.min(0, ...values);
  const span = Math.max(0, ...values) - low || 1;
  return {
    x: (i: number) => (count > 1 ? (i * 100) / (count - 1) : 50),
    y: (value: number) => 100 - ((value - low) / span) * 100,
  };
}

type Scale = ReturnType<typeof scaleOf>;

/** A band's outline: along its top edge, then back along its bottom; a loan steps. */
function bandPath(spans: Span[], stepped: boolean, scale: Scale): string {
  const edge = (pick: (span: Span) => number) =>
    spans.flatMap((span, i) => {
      const at = `${scale.x(i)},${scale.y(pick(span))}`;
      return stepped && i > 0 ? [`${scale.x(i)},${scale.y(pick(spans[i - 1]!))}`, at] : [at];
    });
  const top = edge((span) => span.high);
  const bottom = edge((span) => span.low).reverse();
  return `M${[...top, ...bottom].join(' L')} Z`;
}

interface NetWorthLineProps {
  points: PeriodValue[];
  bands: NetWorthBand[];
}

/**
 * Net worth over time: the bands by Account kind, the Net worth line over them, a dot per period
 * that opens the Accounts as of its last day (a running period's dot is hollow), a dot per band's
 * point that opens that kind's Accounts then, and the latest point labelled.
 */
export function NetWorthLine({ points, bands }: NetWorthLineProps) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const stacks = stackBands(bands);
  const scale = scaleOf(points.length, [
    ...points.map((point) => point.value),
    ...stacks.flat().flatMap((span) => [span.low, span.high]),
  ]);
  const latest = points.length - 1;
  return (
    <figure>
      <div className="relative mx-2 mt-8 h-40">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          {bands.map((band, b) => (
            <path
              key={band.key}
              d={bandPath(stacks[b]!, isStepped(band), scale)}
              className={toneOf(band).fill}
              fillOpacity={0.85}
            />
          ))}
          <line
            x1={0}
            x2={100}
            y1={scale.y(0)}
            y2={scale.y(0)}
            className="stroke-rule-strong"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={points.map((point, i) => `${scale.x(i)},${scale.y(point.value)}`).join(' ')}
            fill="none"
            className="stroke-hero-deep"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {bands.map((band, b) =>
          band.points.map((point, i) =>
            point.value === 0 ? null : (
              <Link
                key={`${band.key}-${point.label}`}
                href={point.href}
                aria-label={`${band.label}, ${point.label}: ${money(point.value)}`}
                title={`${band.label}, ${point.label}: ${money(point.value)}`}
                className="group absolute flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{
                  left: `${scale.x(i)}%`,
                  top: `${scale.y((stacks[b]![i]!.low + stacks[b]![i]!.high) / 2)}%`,
                }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full opacity-0 ring-1 ring-surface group-hover:opacity-100 group-focus-visible:opacity-100 ${toneOf(band).dot}`}
                />
              </Link>
            ),
          ),
        )}
        {points.map((point, i) => (
          <Link
            key={point.label}
            href={point.href}
            aria-label={`${point.label}: ${money(point.value)}`}
            title={`${point.label}: ${money(point.value)}`}
            className="group absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${scale.x(i)}%`, top: `${scale.y(point.value)}%` }}
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
      </div>
      {points.length > 0 && (
        <div className="mt-3 flex justify-between text-xs text-muted" aria-hidden>
          <span>{points[0]!.label}</span>
          {points.length > 1 && <span>{points[latest]!.label}</span>}
        </div>
      )}
      {bands.length > 0 && (
        <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-hidden>
          {bands.map((band) => (
            <span key={band.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${toneOf(band).swatch}`} />
              {band.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

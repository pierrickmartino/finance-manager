'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { ringArcPath, ringSlices, type RingSlice } from '@/lib/reporting/ring';

/**
 * A Donut Widget's mark on its card (docs/design-system.md, "Charts"): a ring of its parts in
 * the hero's navy, the total in the hole, and beside it a list of every part with its amount
 * and share. Pointing at a slice or a row, or focusing a row, shows that part in the hole.
 */

const RING = { size: 160, outer: 78, inner: 52 };
/** Radians left between neighbouring slices. */
const SLICE_GAP = 0.012;
/** At or above this share a part is the whole ring, drawn as a circle. */
const WHOLE = 0.999;

/** The navy ramp, darkest first (`RING_TONES` long); full class names for Tailwind. */
const FILLS = [
  'fill-hero-deep',
  'fill-hero',
  'fill-hero-mid',
  'fill-hero-glow',
  'fill-hero-glow/60',
  'fill-hero-mist',
  'fill-hero-mist/60',
];

const fill = (slice: RingSlice) => (slice.isOther ? 'fill-rule-strong' : FILLS[slice.tone]);

function percent(share: number): string {
  const value = share * 100;
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
}

type Money = (minor: number) => string;

interface SliceMarkProps {
  slice: RingSlice;
  isDimmed: boolean;
  onPoint: (isPointing: boolean) => void;
}

/** One slice; a counter part (a refund among expenses) is outlined in dashes. */
function SliceMark({ slice, isDimmed, onPoint }: SliceMarkProps) {
  const { isCounter } = slice;
  const common = {
    className: `${fill(slice)} transition-opacity ${isCounter ? 'stroke-negative' : ''}`,
    opacity: isDimmed ? 0.25 : 1,
    strokeWidth: isCounter ? 1.5 : 0,
    strokeDasharray: isCounter ? '3 2' : undefined,
    onMouseEnter: () => onPoint(true),
    onMouseLeave: () => onPoint(false),
  };
  if (slice.share >= WHOLE)
    return <circle cx={RING.size / 2} cy={RING.size / 2} r={RING.outer} {...common} />;
  return (
    <path
      d={ringArcPath(slice.start + SLICE_GAP / 2, slice.end - SLICE_GAP / 2, RING)}
      {...common}
    />
  );
}

export function DonutRing({ data, money }: { data: ChartSource; money: Money }) {
  const [active, setActive] = useState<number | null>(null);
  const holeId = useId();
  const slices = ringSlices(data);
  const shown = active === null ? null : slices[active];
  const point = (index: number) => (isPointing: boolean) =>
    setActive((current) => (isPointing ? index : current === index ? null : current));

  return (
    <figure className="flex flex-wrap items-center gap-6">
      <div className="relative mx-auto shrink-0" style={{ width: RING.size, height: RING.size }}>
        <svg viewBox={`0 0 ${RING.size} ${RING.size}`} className="h-full w-full" aria-hidden>
          {/* The hole: a whole-ring circle would otherwise fill it. */}
          <mask id={holeId}>
            <rect width={RING.size} height={RING.size} fill="white" />
            <circle cx={RING.size / 2} cy={RING.size / 2} r={RING.inner} fill="black" />
          </mask>
          <g mask={`url(#${holeId})`}>
            {slices.map((slice, i) => (
              <SliceMark
                key={slice.label}
                slice={slice}
                isDimmed={active !== null && active !== i}
                onPoint={point(i)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {shown ? (
            <span className="flex flex-col items-center" aria-hidden>
              <span className="max-w-24 truncate text-xs text-muted">{shown.label}</span>
              <span className="font-display text-lg tracking-tight tabular-nums">
                {money(shown.value)}
              </span>
              <span className="text-xs text-muted">{percent(shown.share)}</span>
            </span>
          ) : (
            // The total opens the Widget's grand total: every Transaction in the ring.
            <Link
              href={data.hrefs.total}
              className="pointer-events-auto flex flex-col items-center rounded-full px-2 hover:underline"
            >
              <span className="text-xs text-muted">Total</span>
              <span className="font-display text-lg tracking-tight tabular-nums">
                {money(data.total ?? 0)}
              </span>
            </Link>
          )}
        </div>
      </div>
      <ul className="flex min-w-48 flex-1 flex-col">
        {slices.map((slice, i) => (
          <li
            key={slice.label}
            onMouseEnter={() => point(i)(true)}
            onMouseLeave={() => point(i)(false)}
          >
            <LegendRow slice={slice} money={money} isActive={active === i} onFocus={point(i)} />
          </li>
        ))}
      </ul>
    </figure>
  );
}

interface LegendRowProps {
  slice: RingSlice;
  money: Money;
  isActive: boolean;
  onFocus: (isFocused: boolean) => void;
}

/** A part's swatch, name, signed amount and share; a link to its Transactions when it has one. */
function LegendRow({ slice, money, isActive, onFocus }: LegendRowProps) {
  const row = (
    <span
      className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${isActive ? 'bg-sunken' : ''}`}
    >
      {/* An SVG dot, so it takes the slice's own fill (`bg-hero` is the hero's gradient). */}
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
        <circle cx={5} cy={5} r={5} className={fill(slice)} />
      </svg>
      <span className="truncate">{slice.label}</span>
      <span className="text-muted tabular-nums">{money(slice.value)}</span>
      <span className="w-9 text-right tabular-nums">{percent(slice.share)}</span>
    </span>
  );
  if (!slice.href) return row;
  return (
    <Link
      href={slice.href}
      className="block"
      onFocus={() => onFocus(true)}
      onBlur={() => onFocus(false)}
    >
      {row}
    </Link>
  );
}

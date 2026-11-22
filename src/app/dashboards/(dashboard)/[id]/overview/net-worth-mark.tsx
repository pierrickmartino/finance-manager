'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import type { LineMarker, NetWorthBand, PeriodValue } from '@/lib/reporting/card';
import {
  alongLine,
  bandPath,
  labelSide,
  scaleOf,
  type LabelSide,
  stackBands,
  type Scale,
  type Span,
} from '@/lib/reporting/net-worth-chart';
import type { AccountKind } from '@/server/services/accounts/input';

/**
 * The Net worth card's mark (docs/design-system.md, "Charts"): a band per account kind,
 * current, savings and 3a stacked above zero and loans below, under the navy Net worth line.
 * capital movements sit on the line as amber diamonds. Amounts in minor units, shown in CHF.
 */

type Money = (minor: number) => string;

/** A band's fill, its hover dot and its legend swatch. */
interface BandTone {
  fill: string;
  dot: string;
  swatch: string;
}

/** Each kind's tone; a loan, below zero, is debt. */
const BAND_TONES: Record<AccountKind, BandTone> = {
  current: { fill: 'fill-ramp-3', dot: 'bg-ramp-3', swatch: 'bg-ramp-3' },
  savings: { fill: 'fill-ramp-4', dot: 'bg-ramp-4', swatch: 'bg-ramp-4' },
  '3a': { fill: 'fill-ramp-5', dot: 'bg-ramp-5', swatch: 'bg-ramp-5' },
  loan: { fill: 'fill-negative-tint', dot: 'bg-negative', swatch: 'bg-negative-tint' },
};

/** The bands' fill opacity: a touch translucent, so they sit back behind the Net worth line. */
const BAND_FILL_OPACITY = 0.85;

/** A loan is tracked by Balance snapshots: it holds flat until the next point, then steps. */
const isStepped = (band: NetWorthBand): boolean => band.key === 'loan';

interface PlotProps {
  points: PeriodValue[];
  bands: NetWorthBand[];
  stacks: Span[][];
  scale: Scale;
}

/** The drawing under the links: the bands, the zero line and the Net worth line. */
function NetWorthPlot({ points, bands, stacks, scale }: PlotProps) {
  return (
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
          className={BAND_TONES[band.key].fill}
          fillOpacity={BAND_FILL_OPACITY}
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
        className="stroke-ramp-1"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface BandDotsProps {
  bands: NetWorthBand[];
  stacks: Span[][];
  scale: Scale;
  money: Money;
}

/** A dot in the middle of each band's point, shown on hover, opening that kind's Accounts then. */
function BandDots({ bands, stacks, scale, money }: BandDotsProps) {
  return bands.flatMap((band, b) =>
    band.points.flatMap((point, i) => {
      if (point.value === 0) return [];
      const { low, high } = stacks[b]![i]!;
      const text = `${band.label}, ${point.label}: ${money(point.value)}`;
      return [
        <Link
          key={`${band.key}-${point.label}`}
          href={point.href}
          aria-label={text}
          title={text}
          className="group absolute flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: `${scale.x(i)}%`, top: `${scale.y((low + high) / 2)}%` }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full opacity-0 ring-1 ring-surface group-hover:opacity-100 group-focus-visible:opacity-100 ${BAND_TONES[band.key].dot}`}
          />
        </Link>,
      ];
    }),
  );
}

interface PointDotsProps {
  points: PeriodValue[];
  scale: Scale;
  money: Money;
}

/** Where a value label hangs from its dot, so it never runs past the plot's edge. */
const LABEL_SIDE_CLASS: Record<LabelSide, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/** A dot per point opening the Accounts as of its date (hollow while running), the latest labelled. */
function PointDots({ points, scale, money }: PointDotsProps) {
  const latest = points.length - 1;
  return points.map((point, i) => (
    <Link
      key={point.label}
      href={point.href}
      aria-label={`${point.label}: ${money(point.value)}`}
      title={`${point.label}: ${money(point.value)}`}
      className="group absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ left: `${scale.x(i)}%`, top: `${scale.y(point.value)}%` }}
    >
      {i === latest && (
        <span
          className={`absolute -top-2 -translate-y-full ${LABEL_SIDE_CLASS[labelSide(scale.x(i))]} rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper`}
        >
          {money(point.value)}
        </span>
      )}
      <span
        className={`h-2.5 w-2.5 rounded-full border-2 border-ramp-1 group-hover:scale-125 ${
          point.isPartial ? 'bg-surface' : 'bg-ramp-1'
        }`}
      />
    </Link>
  ));
}

interface CapitalMarkerLinkProps {
  marker: LineMarker;
  /** Where it sits in the plot, in percent. */
  x: number;
  y: number;
}

/** A capital movement on the line: an amber diamond that opens its Transaction. */
function CapitalMarkerLink({ marker, x, y }: CapitalMarkerLinkProps) {
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

/** The first and latest period under the plot, and a swatch per band. */
function NetWorthLegend({ points, bands }: Pick<PlotProps, 'points' | 'bands'>) {
  return (
    <>
      {points.length > 0 && (
        <div className="mt-3 flex justify-between text-xs text-muted" aria-hidden>
          <span>{points[0]!.label}</span>
          {points.length > 1 && <span>{points.at(-1)!.label}</span>}
        </div>
      )}
      {bands.length > 0 && (
        <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-hidden>
          {bands.map((band) => (
            <span key={band.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${BAND_TONES[band.key].swatch}`} />
              {band.label}
            </span>
          ))}
        </figcaption>
      )}
    </>
  );
}

interface NetWorthLineProps {
  points: PeriodValue[];
  bands: NetWorthBand[];
  markers?: LineMarker[];
}

/**
 * Net worth over time: the bands by account kind, the Net worth line over them, a dot per
 * period that opens the Accounts as of its last day, a dot per band's point that opens that
 * kind's Accounts then, and a diamond per capital movement that opens its Transaction.
 */
export function NetWorthLine({ points, bands, markers = [] }: NetWorthLineProps) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const stacks = stackBands(bands);
  const scale = scaleOf(points.length, [
    ...points.map((point) => point.value),
    ...stacks.flat().flatMap((span) => [span.low, span.high]),
  ]);
  return (
    // From `lg` up the card's height is set, and the plot takes what its facts leave.
    <figure className="flex flex-col lg:flex-1">
      <div className="relative mx-2 mt-8 h-40 lg:h-auto lg:min-h-24 lg:flex-1">
        <NetWorthPlot points={points} bands={bands} stacks={stacks} scale={scale} />
        <BandDots bands={bands} stacks={stacks} scale={scale} money={money} />
        <PointDots points={points} scale={scale} money={money} />
        {markers.map((marker, i) => (
          <CapitalMarkerLink
            key={`${marker.href}-${i}`}
            marker={marker}
            {...alongLine(points, marker.at, scale)}
          />
        ))}
      </div>
      <NetWorthLegend points={points} bands={bands} />
    </figure>
  );
}

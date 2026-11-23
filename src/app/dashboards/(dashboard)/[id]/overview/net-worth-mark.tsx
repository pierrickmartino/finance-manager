'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { RampGradient, url, useRampGradientIds } from '@/components/ramp-gradient';
import { cssGradient, PLOT_LABEL, RAMP_FILLS, type RampFill } from '@/lib/color/ramp-fills';
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
 * current, savings and 3a stacked above zero and loans below, under the near-white Net worth
 * line and the area under it. The bands above zero and the area are ramp gradients (fills
 * only); the line, its points and its label stay flat. Capital movements sit on the line as diamonds in the cyan accent, the point of the
 * chart. Amounts in minor units, shown in CHF.
 */

type Money = (minor: number) => string;

/**
 * A band's fill, its hover dot and its legend swatch: a ramp gradient filling both band and
 * swatch, or, for debt, flat classes.
 */
type BandTone = { dot: string } & ({ gradient: RampFill } | { fill: string; swatch: string });

/** Each kind's tone; a loan, below zero, is debt, so `negative` and never the ramp. */
const BAND_TONES: Record<AccountKind, BandTone> = {
  current: { gradient: RAMP_FILLS.currentBand, dot: 'bg-ramp-2' },
  savings: { gradient: RAMP_FILLS.savingsBand, dot: 'bg-ramp-4' },
  '3a': { gradient: RAMP_FILLS.pillarBand, dot: 'bg-ramp-5' },
  loan: { fill: 'fill-negative/45', swatch: 'bg-negative/45', dot: 'bg-negative' },
};

/** The value label's plate and text, the pair `design-tokens.test.ts` checks over the bands. */
const LABEL_TONE =
  'bg-ink text-paper' satisfies `bg-${typeof PLOT_LABEL.plate} text-${typeof PLOT_LABEL.text}`;

/** A loan is tracked by Balance snapshots: it holds flat until the next point, then steps. */
const isStepped = (band: NetWorthBand): boolean => band.key === 'loan';

interface PlotProps {
  points: PeriodValue[];
  bands: NetWorthBand[];
  stacks: Span[][];
  scale: Scale;
}

/**
 * The drawing under the links: the area under the Net worth line (seen where no band covers
 * it), the bands, the zero line and the line itself.
 */
function NetWorthPlot({ points, bands, stacks, scale }: PlotProps) {
  const idOf = useRampGradientIds();
  const line = points.map((point, i) => `${scale.x(i)},${scale.y(point.value)}`);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <RampGradient id={idOf('area')} fill={RAMP_FILLS.netWorthArea} />
        {bands.map((band) => {
          const tone = BAND_TONES[band.key];
          return (
            'gradient' in tone && (
              <RampGradient key={band.key} id={idOf(band.key)} fill={tone.gradient} />
            )
          );
        })}
      </defs>
      {points.length > 1 && (
        <path
          d={`M${scale.x(0)},${scale.y(0)} L${line.join(' L')} L${scale.x(points.length - 1)},${scale.y(0)} Z`}
          fill={url(idOf('area'))}
        />
      )}
      {bands.map((band, b) => {
        const tone = BAND_TONES[band.key];
        return (
          <path
            key={band.key}
            d={bandPath(stacks[b]!, isStepped(band), scale)}
            {...('gradient' in tone ? { fill: url(idOf(band.key)) } : { className: tone.fill })}
          />
        );
      })}
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
        points={line.join(' ')}
        fill="none"
        className="stroke-ink"
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
          className={`absolute -top-2 -translate-y-full ${LABEL_SIDE_CLASS[labelSide(scale.x(i))]} rounded-lg px-2 py-1 text-xs whitespace-nowrap ${LABEL_TONE}`}
        >
          {money(point.value)}
        </span>
      )}
      <span
        className={`h-2.5 w-2.5 rounded-full border-2 border-ink group-hover:scale-125 ${
          point.isPartial ? 'bg-surface' : 'bg-ink'
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

/** A capital movement on the line: a diamond in the accent that opens its Transaction. */
function CapitalMarkerLink({ marker, x, y }: CapitalMarkerLinkProps) {
  return (
    <Link
      href={marker.href}
      aria-label={`Capital movement on ${marker.date}: ${marker.title}`}
      title={`${marker.date} · ${marker.title}`}
      className="group absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="h-2.5 w-2.5 rotate-45 border border-paper bg-accent group-hover:scale-125" />
    </Link>
  );
}

/** A band's legend swatch: its gradient, or its flat tone. */
function Swatch({ tone }: { tone: BandTone }) {
  return 'gradient' in tone ? (
    <span className="h-2 w-2 rounded-sm" style={{ backgroundImage: cssGradient(tone.gradient) }} />
  ) : (
    <span className={`h-2 w-2 rounded-sm ${tone.swatch}`} />
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
              <Swatch tone={BAND_TONES[band.key]} />
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

'use client';

import Link from 'next/link';
import { gradientFill, RampGradient, useRampGradientIds } from '@/components/ramp-gradient';
import { RAMP_FILLS, type RampFill } from '@/lib/color/ramp-fills';
import type { FlowPoint } from '@/lib/reporting/card';
import { intervalLabel } from '@/lib/reporting/interval-label';
import { labelSide, scaleOf, type LabelSide, type Scale } from '@/lib/reporting/net-worth-chart';
import { useMoney } from './marks';
import { FIGURES_ATTRIBUTE, useFlowPointer, type FlowSeries } from './use-flow-pointer';

/**
 * A line flow's mark (docs/design-system.md, "Charts"; GLOSSARY: Card): two overlapping areas,
 * income and expense, each a ramp gradient under its flat line, so the gap between them is the
 * Profit. Each series is one path, whatever the number of points; only the hovered or focused
 * point draws more: a crosshair, its dots and its figures, Income and Expense each a link to
 * its column's Drill-down. A segment reaching a partial point is dashed and that point's dots
 * are hollow. Amounts in minor units, shown in CHF.
 */

type Money = (minor: number) => string;

type Series = FlowSeries;

interface SeriesTone {
  label: string;
  /** The area's gradient. */
  fill: RampFill;
  /** The flat line; its dot's outline, and its fill once full; its legend swatch. */
  stroke: string;
  dot: string;
  swatch: string;
}

const SERIES: Record<Series, SeriesTone> = {
  income: {
    label: 'Income',
    fill: RAMP_FILLS.incomeArea,
    stroke: 'stroke-ramp-1',
    dot: 'border-ramp-1 bg-ramp-1',
    swatch: 'bg-ramp-1',
  },
  expense: {
    label: 'Expense',
    fill: RAMP_FILLS.expenseArea,
    stroke: 'stroke-ramp-4',
    dot: 'border-ramp-4 bg-ramp-4',
    swatch: 'bg-ramp-4',
  },
};

const SERIES_ORDER: readonly Series[] = ['income', 'expense'];

/** A run of the line drawn one way: solid between full points, dashed into a partial one. */
interface Run {
  from: number;
  to: number;
  isDashed: boolean;
}

/** The line's runs: a segment is dashed when either of its ends is partial. */
function runsOf(points: readonly FlowPoint[]): Run[] {
  return points.slice(1).reduce<Run[]>((runs, point, i) => {
    const isDashed = point.isPartial || points[i]!.isPartial;
    const last = runs.at(-1);
    if (last && last.isDashed === isDashed) {
      return [...runs.slice(0, -1), { ...last, to: i + 1 }];
    }
    return [...runs, { from: i, to: i + 1, isDashed }];
  }, []);
}

const coordinates = (values: readonly number[], scale: Scale): string[] =>
  values.map((value, i) => `${scale.x(i)},${scale.y(value)}`);

interface PlotProps {
  points: FlowPoint[];
  scale: Scale;
}

/** The two areas (expense under income, so the lighter income line reads on top), and their lines. */
function FlowPlot({ points, scale }: PlotProps) {
  const idOf = useRampGradientIds();
  const runs = runsOf(points);
  const last = points.length - 1;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        {SERIES_ORDER.map((series) => (
          <RampGradient key={series} id={idOf(series)} fill={SERIES[series].fill} />
        ))}
      </defs>
      {[...SERIES_ORDER].reverse().map((series) => {
        const line = coordinates(
          points.map((point) => point[series]),
          scale,
        );
        return (
          <g key={series}>
            {points.length > 1 && (
              <path
                d={`M${scale.x(0)},${scale.y(0)} L${line.join(' L')} L${scale.x(last)},${scale.y(0)} Z`}
                fill={gradientFill(idOf(series))}
              />
            )}
            {runs.map((run) => (
              <polyline
                key={run.from}
                points={line.slice(run.from, run.to + 1).join(' ')}
                fill="none"
                className={SERIES[series].stroke}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeDasharray={run.isDashed ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
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
    </svg>
  );
}

/**
 * Which side of the crosshair the figures hang on, so they never run past the plot's edge:
 * right of it on the plot's left half, left of it on its right half.
 */
const TOOLTIP_SIDE_CLASS: Record<LabelSide, string> = {
  start: 'ml-2',
  center: 'ml-2',
  end: '-ml-2 -translate-x-full',
};

/** A figure of a point: what came in or went out (opening its column's Drill-down), or kept. */
interface PointFigure {
  label: string;
  value: string;
  href: string | null;
}

/**
 * What a point says: what came in, what went out and what was kept, through it when the
 * points are running totals.
 */
function pointFigures(point: FlowPoint, money: Money, isRunning: boolean): PointFigure[] {
  return [
    { label: SERIES.income.label, value: money(point.income), href: point.incomeHref },
    { label: SERIES.expense.label, value: money(point.expense), href: point.expenseHref },
    {
      label: isRunning ? 'Kept so far' : 'Kept',
      value: money(point.income - point.expense),
      href: null,
    },
  ];
}

interface ActivePointProps {
  point: FlowPoint;
  index: number;
  scale: Scale;
}

/** The active point's marks: a crosshair and a dot on each line (hollow while partial). */
function ActivePoint({ point, index, scale }: ActivePointProps) {
  const x = scale.x(index);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span
        className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-rule-strong"
        style={{ left: `${x}%` }}
      />
      {SERIES_ORDER.map((series) => (
        <span
          key={series}
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ring-2 ring-surface ${SERIES[series].dot} ${point.isPartial ? 'bg-surface!' : ''}`}
          style={{ left: `${x}%`, top: `${scale.y(point[series])}%` }}
        />
      ))}
    </div>
  );
}

interface PointTooltipProps extends ActivePointProps {
  money: Money;
  isRunning: boolean;
  isTappable: boolean;
}

/**
 * The active point's figures, on a plate beside the crosshair. They follow a mouse, which
 * opens a column by clicking its area, so they let its clicks through; a tap or the keyboard
 * reaches their links.
 */
function PointTooltip({ point, index, scale, money, isRunning, isTappable }: PointTooltipProps) {
  const x = scale.x(index);
  const name = intervalLabel(point);
  return (
    <div
      className={`absolute top-0 z-10 rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-lg ${TOOLTIP_SIDE_CLASS[labelSide(x)]} ${isTappable ? '' : 'pointer-events-none'}`}
      style={{ left: `${x}%` }}
    >
      <p className="font-medium whitespace-nowrap text-ink">{name}</p>
      <dl
        {...{ [FIGURES_ATTRIBUTE]: '' }}
        className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5"
      >
        {pointFigures(point, money, isRunning).map((figure) => (
          <div key={figure.label} className="contents">
            <dt className="text-muted">{figure.label}</dt>
            <dd className="text-right text-ink tabular-nums">
              {figure.href ? (
                <Link
                  href={figure.href}
                  aria-label={`${figure.label}, ${name}: ${figure.value}`}
                  className="rounded-sm hover:underline"
                >
                  {figure.value}
                </Link>
              ) : (
                figure.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The first and last point under the plot, and a swatch per series. */
function FlowLegend({ points }: { points: FlowPoint[] }) {
  return (
    <>
      <div className="mt-3 flex justify-between text-xs text-muted" aria-hidden>
        <span>{intervalLabel(points[0]!)}</span>
        {points.length > 1 && <span>{intervalLabel(points.at(-1)!)}</span>}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {SERIES_ORDER.map((series) => (
          <span key={series} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${SERIES[series].swatch}`} aria-hidden />
            {SERIES[series].label}
          </span>
        ))}
      </figcaption>
    </>
  );
}

interface FlowAreasProps {
  points: FlowPoint[];
  /** Each point is a running total from the first: its Drill-downs cover the rows through it. */
  isRunning: boolean;
}

/**
 * Income and expense as two overlapping areas. The plot is one focusable control: the pointer
 * or the arrow keys pick a point, which shows its figures; a click opens the Drill-down of the
 * area under the pointer, and Enter moves to the figures' links, one per column, each summing
 * to its point (`useFlowPointer`).
 */
export function FlowAreas({ points, isRunning }: FlowAreasProps) {
  const money = useMoney();
  const scale = scaleOf(
    points.length,
    points.flatMap((point) => [point.income, point.expense]),
  );
  const pointer = useFlowPointer(points, scale);
  if (points.length === 0) return null;
  const { active } = pointer;
  const point = active === null ? null : (points[active] ?? null);
  const first = intervalLabel(points[0]!);
  const last = intervalLabel(points.at(-1)!);

  return (
    // From `lg` up the card's height is set, and the plot takes what its facts leave.
    <figure className="flex flex-col lg:flex-1">
      <div
        className="relative mx-2 mt-2 h-40 lg:h-auto lg:min-h-24 lg:flex-1"
        onBlur={pointer.onBlur}
      >
        <FlowPlot points={points} scale={scale} />
        {point && <ActivePoint point={point} index={active!} scale={scale} />}
        <div
          role="group"
          tabIndex={0}
          aria-roledescription="chart"
          aria-label={`Income and expense, ${points.length} points from ${first} to ${last}. Arrow keys pick a point, Enter moves to its Income and Expense Transactions.`}
          className="absolute inset-0 cursor-pointer rounded-md"
          {...pointer.controlProps}
        />
        {point && (
          <PointTooltip
            point={point}
            index={active!}
            scale={scale}
            money={money}
            isRunning={isRunning}
            isTappable={pointer.isTappable}
          />
        )}
        <p className="sr-only" aria-live="polite">
          {point &&
            `${intervalLabel(point)}: ${pointFigures(point, money, isRunning)
              .map((figure) => `${figure.label} ${figure.value}`)
              .join(', ')}`}
        </p>
      </div>
      <FlowLegend points={points} />
    </figure>
  );
}

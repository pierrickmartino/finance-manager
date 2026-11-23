'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { gradientFill, RampGradient, useRampGradientIds } from '@/components/ramp-gradient';
import { RAMP_FILLS, type RampFill } from '@/lib/color/ramp-fills';
import type { FlowPoint } from '@/lib/reporting/card';
import { labelSide, scaleOf, type LabelSide, type Scale } from '@/lib/reporting/net-worth-chart';

/**
 * A line flow's mark (docs/design-system.md, "Charts"; GLOSSARY: Card): two overlapping areas,
 * income and expense, each a ramp gradient under its flat line, so the gap between them is the
 * Profit. Each series is one path, whatever the number of points; only the hovered or focused
 * point draws more: a crosshair, its dots and its figures. A segment reaching a partial point
 * is dashed and that point's dots are hollow. Clicking the plot, or Enter on it, opens the
 * point's Drill-down. Amounts in minor units, shown in CHF.
 */

type Money = (minor: number) => string;

type Series = 'income' | 'expense';

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
      className="absolute inset-0 h-full w-full overflow-visible"
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

/** A point's name, saying when it is still running. */
const pointName = (point: FlowPoint): string =>
  point.isPartial ? `${point.label} (to date)` : point.label;

/**
 * What a point says: what came in, what went out and what was kept, through it when the
 * points are running totals.
 */
function pointFigures(
  point: FlowPoint,
  money: Money,
  isRunning: boolean,
): { label: string; value: string }[] {
  return [
    { label: SERIES.income.label, value: money(point.income) },
    { label: SERIES.expense.label, value: money(point.expense) },
    { label: isRunning ? 'Kept so far' : 'Kept', value: money(point.income - point.expense) },
  ];
}

interface ActivePointProps {
  point: FlowPoint;
  index: number;
  scale: Scale;
  money: Money;
  isRunning: boolean;
}

/** The active point: a crosshair, a dot on each line (hollow while partial) and its figures. */
function ActivePoint({ point, index, scale, money, isRunning }: ActivePointProps) {
  const x = scale.x(index);
  const side = labelSide(x);
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
      <div
        className={`absolute top-0 z-10 rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-lg ${TOOLTIP_SIDE_CLASS[side]}`}
        style={{ left: `${x}%` }}
      >
        <p className="font-medium whitespace-nowrap text-ink">{pointName(point)}</p>
        <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
          {pointFigures(point, money, isRunning).map((figure) => (
            <div key={figure.label} className="contents">
              <dt className="text-muted">{figure.label}</dt>
              <dd className="text-right text-ink tabular-nums">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** The point nearest the pointer, across the plot's width. */
function indexAt(event: MouseEvent<HTMLElement>, count: number): number {
  const box = event.currentTarget.getBoundingClientRect();
  const along = box.width === 0 ? 0 : (event.clientX - box.left) / box.width;
  return Math.min(count - 1, Math.max(0, Math.round(along * (count - 1))));
}

/** Where a key moves the active point: a step either way, or to either end. */
function steppedIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, index - 1);
    case 'ArrowRight':
      return Math.min(count - 1, index + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** The first and last point under the plot, and a swatch per series. */
function FlowLegend({ points }: { points: FlowPoint[] }) {
  return (
    <>
      <div className="mt-3 flex justify-between text-xs text-muted" aria-hidden>
        <span>{points[0]!.label}</span>
        {points.length > 1 && <span>{pointName(points.at(-1)!)}</span>}
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
  /** Each point is a running total from the first: its Drill-down covers the rows through it. */
  isRunning: boolean;
}

/**
 * Income and expense as two overlapping areas. The plot is one focusable control: the pointer
 * or the arrow keys pick a point, which shows its figures; a click or Enter opens its
 * Drill-down (both columns, so it sums to what was kept). A touch has no hover, so its first
 * tap on a point shows the figures and a second one opens them.
 */
export function FlowAreas({ points, isRunning }: FlowAreasProps) {
  const router = useRouter();
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const [active, setActive] = useState<number | null>(null);
  const pointerType = useRef('mouse');
  if (points.length === 0) return null;
  const scale = scaleOf(
    points.length,
    points.flatMap((point) => [point.income, point.expense]),
  );
  const point = active === null ? null : (points[active] ?? null);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const index = indexAt(event, points.length);
    if (pointerType.current !== 'mouse' && index !== active) {
      setActive(index);
      return;
    }
    router.push(points[index]!.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && point) {
      router.push(point.href);
      return;
    }
    const next = steppedIndex(event.key, active ?? points.length - 1, points.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  return (
    // From `lg` up the card's height is set, and the plot takes what its facts leave.
    <figure className="flex flex-col lg:flex-1">
      <div className="relative mx-2 mt-2 h-40 lg:h-auto lg:min-h-24 lg:flex-1">
        <FlowPlot points={points} scale={scale} />
        {point && (
          <ActivePoint
            point={point}
            index={active!}
            scale={scale}
            money={money}
            isRunning={isRunning}
          />
        )}
        <div
          role="group"
          tabIndex={0}
          aria-roledescription="chart"
          aria-label={`Income and expense, ${points.length} points from ${points[0]!.label} to ${pointName(points.at(-1)!)}. Arrow keys pick a point, Enter opens its Transactions.`}
          className="absolute inset-0 cursor-pointer rounded-md"
          onPointerDown={(event) => {
            pointerType.current = event.pointerType;
          }}
          onPointerMove={(event) => {
            if (event.pointerType === 'mouse') setActive(indexAt(event, points.length));
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setActive(null);
          }}
          onClick={onClick}
          onFocus={(event) => {
            // Focus from the keyboard picks the latest point; a pointer picks its own.
            if (event.currentTarget.matches(':focus-visible')) {
              setActive((current) => current ?? points.length - 1);
            }
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        />
        <p className="sr-only" aria-live="polite">
          {point &&
            `${pointName(point)}: ${pointFigures(point, money, isRunning)
              .map((figure) => `${figure.label} ${figure.value}`)
              .join(', ')}`}
        </p>
      </div>
      <FlowLegend points={points} />
    </figure>
  );
}

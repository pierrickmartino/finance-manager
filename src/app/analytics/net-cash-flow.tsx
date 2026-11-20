import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { NetCashFlow, NetCashFlowPoint } from '@/server/services/analytics';
import { drillHref } from './links';
import { SectionCard } from './section';

export const NET_CASH_FLOW = 'Net cash flow';

/*
 * The Net cash flow line: one point per period of the window in `hero-deep`, the step into the
 * current period dashed and its point hollow ("to date"), zero as a rule. The line is an SVG
 * stretched to the card; the points are links laid over it, so each opens its Drill-down and
 * keeps its shape at any width. A period with no Transaction sits on zero, with no link.
 */

const WIDTH = 100;
const HEIGHT = 100;
/** Room above and below the line's extremes, as a share of the plot's height. */
const INSET = 0.08;

interface Plotted {
  point: NetCashFlowPoint;
  /** Percent from the left and from the top. */
  x: number;
  y: number;
}

function plot(points: readonly NetCashFlowPoint[]): { plotted: Plotted[]; zero: number } {
  const values = points.map((point) => point.value ?? 0);
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const span = high - low || 1;
  const yOf = (value: number) => (INSET + (1 - INSET * 2) * ((high - value) / span)) * HEIGHT;
  const step = WIDTH / points.length;
  return {
    plotted: points.map((point, index) => ({
      point,
      x: step * (index + 0.5),
      y: yOf(point.value ?? 0),
    })),
    zero: yOf(0),
  };
}

const path = (plotted: readonly Plotted[]) =>
  plotted.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');

interface NetCashFlowSectionProps {
  line: Promise<NetCashFlow>;
  view: PeriodView;
  fmt: Formatter;
}

/** Analytics' Net cash flow line, once its figures arrive. */
export async function NetCashFlowSection({ line, view, fmt }: NetCashFlowSectionProps) {
  const loaded = await line;
  return (
    <SectionCard name={NET_CASH_FLOW}>
      {loaded.isEmpty ? (
        <p className="py-8 text-sm text-muted">
          Nothing to show yet: no money came in or went out in these periods.
        </p>
      ) : (
        <NetCashFlowChart points={loaded.points} view={view} fmt={fmt} />
      )}
    </SectionCard>
  );
}

interface NetCashFlowChartProps {
  points: NetCashFlowPoint[];
  view: PeriodView;
  fmt: Formatter;
}

function NetCashFlowChart({ points, view, fmt }: NetCashFlowChartProps) {
  const { plotted, zero } = plot(points);
  const settled = plotted.filter(({ point }) => !point.isToDate);
  const tail = plotted.slice(Math.max(0, settled.length - 1));
  return (
    <figure aria-label={`${NET_CASH_FLOW} line chart`} className="flex flex-col gap-2">
      <div className="relative h-56">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <line
            x1={0}
            x2={WIDTH}
            y1={zero}
            y2={zero}
            vectorEffect="non-scaling-stroke"
            className="stroke-rule-strong"
          />
          <path
            d={path(settled)}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="stroke-hero-deep"
          />
          {tail.length > 1 && (
            <path
              d={path(tail)}
              fill="none"
              strokeWidth={2}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              className="stroke-hero-deep"
            />
          )}
        </svg>
        {plotted.map((plotted) => (
          <PointMark key={plotted.point.key} {...plotted} view={view} fmt={fmt} />
        ))}
      </div>
      <PeriodLabels points={points} />
    </figure>
  );
}

interface PointMarkProps extends Plotted {
  view: PeriodView;
  fmt: Formatter;
}

function PointMark({ point, x, y, view, fmt }: PointMarkProps) {
  if (point.value === null) return null;
  const amount = fmt.amount(point.value, { currency: 'CHF' });
  const name = `${NET_CASH_FLOW}, ${point.label}${point.isToDate ? ' to date' : ''}: ${amount}`;
  return (
    <Link
      href={drillHref(view, point.drill)}
      aria-label={name}
      title={name}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="group absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
    >
      <span
        className={`size-2.5 rounded-full border-2 border-hero-deep transition-transform group-hover:scale-150 ${
          point.isToDate ? 'bg-surface' : 'bg-hero-deep'
        }`}
      />
    </Link>
  );
}

/** Where a period's label sits under its point: the edges run inwards, the rest centre. */
function labelClass(index: number, count: number): string {
  if (index === 0) return 'justify-self-start whitespace-nowrap';
  if (index === count - 1) return 'justify-self-end whitespace-nowrap text-right';
  // Too narrow for every label until the widest screens: the edges carry the window.
  return 'hidden truncate text-center 2xl:block';
}

/** The periods under the line, each under its own point. */
function PeriodLabels({ points }: { points: NetCashFlowPoint[] }) {
  return (
    <ol
      aria-hidden="true"
      className="grid text-xs text-muted"
      style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
    >
      {points.map((point, index) => (
        <li key={point.key} className={labelClass(index, points.length)}>
          {point.label}
          {point.isToDate && <span className="block">to date</span>}
        </li>
      ))}
    </ol>
  );
}

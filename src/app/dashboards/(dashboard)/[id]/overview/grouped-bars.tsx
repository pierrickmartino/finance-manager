'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { IntervalPair } from '@/lib/reporting/card';
import { intervalLabel } from '@/lib/reporting/interval-label';
import { CHART_TOOLTIP_CLASS, tooltipSideClass } from './chart-tooltip';
import { FlowSwatches } from './flow-areas';
import { shortLabel, useMoney } from './marks';
import { useTapToShow } from './use-flow-pointer';

/**
 * A bars flow's mark (docs/design-system.md, "Charts"; ADR-0022): an Income bar (`ramp-1`) and
 * an Expense bar (`ramp-4`) side by side per Interval, on one shared scale over a zero line. A
 * partial Interval (cut short at the Period's start, or still running) is hatched; a side that
 * nets the wrong way drops below zero in translucent `negative`, never clamped. Hovering,
 * focusing or tapping a pair shows its figures; each bar opens its Drill-down (on a touch
 * screen, the first tap shows the figures and the second opens it). Amounts in minor units.
 */

type Side = 'income' | 'expense';

const SIDES: readonly Side[] = ['income', 'expense'];

const SIDE: Record<Side, { label: string; fill: string; href: 'incomeHref' | 'expenseHref' }> = {
  income: { label: 'Income', fill: 'bg-ramp-1', href: 'incomeHref' },
  expense: { label: 'Expense', fill: 'bg-ramp-4', href: 'expenseHref' },
};

/** How many Interval labels fit under the plot: fewer on a narrow card. */
const LABELS_NARROW = 4;
const LABELS_WIDE = 8;

/** Every `step`-th label is drawn, so `limit` of them at most; the first always. */
const labelStep = (count: number, limit: number): number => Math.max(1, Math.ceil(count / limit));

/** The shared scale: where the zero line sits, and how tall a value is, both in % of the plot. */
interface BarScale {
  zeroTop: number;
  height: (value: number) => number;
}

function barScaleOf(intervals: readonly IntervalPair[]): BarScale {
  const values = intervals.flatMap((pair) => [pair.income, pair.expense]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  return { zeroTop: (max / range) * 100, height: (value) => (Math.abs(value) / range) * 100 };
}

interface BarProps {
  pair: IntervalPair;
  side: Side;
  scale: BarScale;
  money: (minor: number) => string;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** One side's bar, the whole height of the plot its link, so a small bar is easy to reach. */
function Bar({ pair, side, scale, money, onClick }: BarProps) {
  const value = pair[side];
  const isBelowZero = value < 0;
  const height = scale.height(value);
  const { label, fill, href } = SIDE[side];
  return (
    <Link
      href={pair[href]}
      onClick={onClick}
      aria-label={`${intervalLabel(pair)}, ${label}: ${money(value)}`}
      className="group/bar relative h-full min-w-0 flex-1 rounded-sm"
    >
      {value !== 0 && (
        <span
          data-partial={pair.isPartial || undefined}
          className={`absolute inset-x-0 overflow-hidden group-hover/bar:opacity-80 ${
            isBelowZero ? 'rounded-b-sm bg-negative/50' : `rounded-t-sm ${fill}`
          }`}
          style={{
            height: `max(2px, ${height}%)`,
            ...(isBelowZero ? { top: `${scale.zeroTop}%` } : { bottom: `${100 - scale.zeroTop}%` }),
          }}
        >
          {/* Hatched over its own colour, so a partial bar still reads as its side. */}
          {pair.isPartial && <span className="absolute inset-0 bg-hatch opacity-60" />}
        </span>
      )}
    </Link>
  );
}

/** The active pair's figures, on a plate above it, kept inside the plot. */
function PairTooltip({
  pair,
  index,
  count,
  money,
}: {
  pair: IntervalPair;
  index: number;
  count: number;
  money: (minor: number) => string;
}) {
  const center = ((index + 0.5) / count) * 100;
  return (
    <div
      aria-hidden
      className={`pointer-events-none ${CHART_TOOLTIP_CLASS} ${tooltipSideClass(center)}`}
      style={{ left: `${center}%` }}
    >
      <p className="font-medium whitespace-nowrap text-ink">{intervalLabel(pair)}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {SIDES.map((s) => (
          <div key={s} className="contents">
            <dt className="text-muted">{SIDE[s].label}</dt>
            <dd className="text-right text-ink tabular-nums">{money(pair[s])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The Interval labels under the plot, thinning out on a narrow card. */
function IntervalLabels({ intervals }: { intervals: readonly IntervalPair[] }) {
  const narrow = labelStep(intervals.length, LABELS_NARROW);
  const wide = labelStep(intervals.length, LABELS_WIDE);
  return (
    <div className="mt-2 flex gap-1 text-xs text-muted @xs:gap-2" aria-hidden>
      {intervals.map((pair, i) => {
        const visibility =
          i % wide !== 0 ? 'invisible' : i % narrow !== 0 ? 'invisible @md:visible' : '';
        return (
          <span
            key={pair.key ?? pair.label}
            className={`min-w-0 flex-1 truncate text-center ${visibility}`}
          >
            {shortLabel(pair.label)}
          </span>
        );
      })}
    </div>
  );
}

/** Income and expense per Interval as grouped bars, with a muted legend naming each side. */
export function GroupedBars({ intervals }: { intervals: IntervalPair[] }) {
  const money = useMoney();
  const scale = barScaleOf(intervals);
  const { active, setActive, onPointerDown, picksOnTap } = useTapToShow();

  // On a touch screen the first tap on a pair shows its figures; the next one opens the bar.
  const clickOf = (index: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (picksOnTap(index)) event.preventDefault();
  };

  return (
    <figure>
      <div
        className="relative h-52 pt-14"
        onPointerDownCapture={onPointerDown}
        onMouseLeave={() => setActive(null)}
      >
        <div className="relative flex h-full gap-1 @xs:gap-2">
          <span
            aria-hidden
            className="absolute inset-x-0 border-t border-rule-strong"
            style={{ top: `${scale.zeroTop}%` }}
          />
          {intervals.map((pair, i) => (
            <div
              key={pair.key ?? pair.label}
              role="group"
              aria-label={intervalLabel(pair)}
              className="relative flex h-full min-w-0 flex-1 gap-0.5"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              {SIDES.map((side) => (
                <Bar
                  key={side}
                  pair={pair}
                  side={side}
                  scale={scale}
                  money={money}
                  onClick={clickOf(i)}
                />
              ))}
            </div>
          ))}
        </div>
        {active !== null && intervals[active] && (
          <PairTooltip
            pair={intervals[active]}
            index={active}
            count={intervals.length}
            money={money}
          />
        )}
      </div>
      <IntervalLabels intervals={intervals} />
      <figcaption className="mt-3">
        <FlowSwatches />
      </figcaption>
    </figure>
  );
}

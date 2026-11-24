'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { cssGradient, RAMP_FILLS } from '@/lib/color/ramp-fills';
import type { MonthFlow, PeriodValue, TickItem } from '@/lib/reporting/card';
import { litTicks } from '@/lib/reporting/overview';

/**
 * The marks the Dashboard's cards draw (docs/design-system.md, "Dashboard"): in the ramp,
 * with the latest full period hatched. Amounts in minor units, shown in CHF.
 */

/** Amounts in minor units, shown as whole CHF. */
export function useMoney(): (minor: number) => string {
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
            <DotColumn value={month.income} max={max} tone="bg-ramp-1" />
            <DotColumn value={month.expense} max={max} tone="bg-ramp-4" />
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
          <span className="h-2 w-2 rounded-full bg-ramp-1" /> In
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ramp-4" /> Out
        </span>
      </figcaption>
    </figure>
  );
}

/** How many periods the bars show: the latest half year reads at a glance. */
const BAR_PERIODS = 6;

/**
 * A bar's look: the marked one hatched, one below zero translucent `negative`, the rest the
 * ramp's gradient (atmosphere only: the hatching alone says which period is pointed out).
 */
function barTone(period: PeriodValue, isMarked: boolean): { className: string; image?: string } {
  if (isMarked) return { className: 'bg-hatch' };
  if (period.value < 0) return { className: 'bg-negative/50' };
  return { className: '', image: cssGradient(RAMP_FILLS.trendBar) };
}

/**
 * The latest periods as rounded bars, the latest one hatched and labelled: the latest full one,
 * or the running one when the range reaches today.
 */
export function MonthBars({ periods }: { periods: PeriodValue[] }) {
  const money = useMoney();
  const shown = periods.slice(-BAR_PERIODS);
  const marked = shown.length - 1;
  const max = Math.max(1, ...shown.map((period) => Math.abs(period.value)));
  return (
    <div className="flex h-52 items-end gap-1.5 pt-8 @xs:gap-3">
      {shown.map((period, i) => {
        const tone = barTone(period, i === marked);
        return (
          <Link
            key={period.label}
            href={period.href}
            aria-label={`${period.label}${period.isPartial ? ' (partial)' : ''}: ${money(period.value)}`}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="relative flex w-full flex-1 items-end">
              {i === marked && (
                <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper">
                  {money(period.value)}
                </span>
              )}
              <span
                className={`w-full rounded-xl group-hover:opacity-80 ${tone.className}`}
                style={{
                  height: `${Math.max(4, (Math.abs(period.value) / max) * 100)}%`,
                  backgroundImage: tone.image,
                }}
              />
            </span>
            <span className="text-xs text-muted">{shortLabel(period.label)}</span>
          </Link>
        );
      })}
    </div>
  );
}

interface EmptyChartProps {
  /** Why there is nothing to draw. */
  sentence: string;
}

/**
 * A chart with nothing to draw: an empty plot over its baseline, the sentence saying why in
 * its middle.
 */
export function EmptyChart({ sentence }: EmptyChartProps) {
  return (
    <figure className="relative flex h-40 items-center justify-center border-b border-rule">
      <figcaption className="px-4 text-center text-sm text-muted">{sentence}</figcaption>
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
          <span className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl px-4 py-3 hover:bg-sunken @2xs:grid-cols-[1fr_auto_auto]">
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted">{item.detail}</span>
            </span>
            <span className="hidden gap-0.5 @2xs:flex" aria-hidden>
              {Array.from({ length: TICKS }, (_, i) => (
                <span
                  key={i}
                  className={`h-4 w-1.5 rounded-sm ${i < lit ? 'bg-ramp-3' : 'bg-rule'}`}
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

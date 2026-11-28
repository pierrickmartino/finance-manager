'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { SparklineDot, SparklineSvg } from '@/components/sparkline-mark';
import { directionOf } from '@/lib/reporting/change-direction';
import { sparkline, type HeadlineChange } from '@/lib/reporting/net-worth-headline';
import type { PeriodValue } from '@/lib/reporting/period-values';

/**
 * Net worth under "Your net worth today" (docs/design-system.md, "Charts"): a filled sparkline
 * of the last 24 months beside the amount, and its change over 1M, 1Y and 2Y as chips. Amounts
 * in minor units, shown in CHF.
 */

type Money = (minor: number) => string;

/**
 * The line filled down to its foot, the latest point a dot (hollow while its month runs), and
 * a strip per point that opens the Accounts as of its date, its dot shown on hover or focus.
 */
export function NetWorthSparkline({
  points,
  money,
  label = 'Net worth over the last 24 months',
}: {
  points: PeriodValue[];
  money: Money;
  /** What the points span, for assistive technology. */
  label?: string;
}) {
  const shape = sparkline(points.map((point) => point.value));
  if (!shape) return null;
  const latest = shape.spots.at(-1)!;
  const strip = 100 / points.length;
  return (
    <div
      role="group"
      aria-label={label}
      className="relative mr-1.5 mb-1.5 h-12 min-w-32 grow basis-32 max-sm:basis-full"
    >
      <SparklineSvg area={shape.area} line={shape.line} />
      {points.map((point, i) => {
        const spot = shape.spots[i]!;
        // The strip is cut at the sparkline's ends, so the first and last never reach past it
        // (and past a phone's edge); its dot stays on the point.
        const from = Math.max(0, spot.x - strip / 2);
        const width = Math.min(100, spot.x + strip / 2) - from;
        return (
          <Link
            key={point.label}
            href={point.href}
            aria-label={`${point.label}: ${money(point.value)}`}
            title={`${point.label}: ${money(point.value)}`}
            className="group absolute inset-y-0"
            style={{ left: `${from}%`, width: `${width}%` }}
          >
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ramp-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{ left: `${((spot.x - from) / width) * 100}%`, top: `${spot.y}%` }}
            />
          </Link>
        );
      })}
      <SparklineDot {...latest} isPartial={points.at(-1)!.isPartial} />
    </div>
  );
}

/**
 * One change chip: its short label, the change and the point it is measured from, at the end of
 * `since` (a period, on the Dashboard) or at its start (`isSinceStart`: the first day of an
 * Analytics Period).
 */
export type ChangeChip = Pick<HeadlineChange, 'since' | 'change' | 'href'> & {
  label: string;
  isSinceStart?: boolean;
};

/**
 * Net worth's change over 1M, 1Y and 2Y (or since an Analytics Period's start), each opening the
 * Accounts as of the point it is measured from. Shown without the currency, which the amount
 * above already says.
 */
export function ChangeChips({ changes }: { changes: readonly ChangeChip[] }) {
  const fmt = useFormatter();
  if (changes.length === 0) return null;
  return (
    <ul aria-label="Change in Net worth" className="mt-2 flex flex-wrap gap-1 text-xs">
      {changes.map(({ label, since, change, href, isSinceStart = false }) => {
        // Direction follows the whole francs shown, so a few cents never read as a move.
        const whole = Math.round(change / 100) * 100;
        const { arrow, sign, tone, word } = directionOf(whole);
        const amount = fmt.amount(Math.abs(whole), { isWhole: true });
        const moved = word === 'unchanged' ? word : `${word} CHF ${amount}`;
        const said = `${label}: ${moved} since the ${isSinceStart ? 'start' : 'end'} of ${since}`;
        return (
          <li key={label}>
            <Link
              href={href}
              aria-label={said}
              title={said}
              className="inline-flex items-baseline gap-1 rounded-md bg-sunken px-1.5 py-0.5 whitespace-nowrap tabular-nums hover:bg-rule"
            >
              <span className="text-muted">{label}</span>
              <span className={tone}>
                <span aria-hidden className="mr-0.5">
                  {arrow}
                </span>
                {sign}
                {amount}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

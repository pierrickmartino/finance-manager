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
      {points.map((point, i) => (
        <Link
          key={point.label}
          href={point.href}
          aria-label={`${point.label}: ${money(point.value)}`}
          title={`${point.label}: ${money(point.value)}`}
          className="group absolute inset-y-0"
          style={{ left: `${shape.spots[i]!.x - strip / 2}%`, width: `${strip}%` }}
        >
          <span
            className="absolute left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hero-deep opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ top: `${shape.spots[i]!.y}%` }}
          />
        </Link>
      ))}
      <SparklineDot {...latest} isPartial={points.at(-1)!.isPartial} />
    </div>
  );
}

/**
 * Net worth's change over 1M, 1Y and 2Y, each opening the Accounts as of the point it is
 * measured from. Shown without the currency, which the amount above already says.
 */
export function ChangeChips({ changes }: { changes: HeadlineChange[] }) {
  const fmt = useFormatter();
  if (changes.length === 0) return null;
  return (
    <ul aria-label="Change in Net worth" className="mt-2 flex flex-wrap gap-1 text-xs">
      {changes.map(({ label, since, change, href }) => {
        // Direction follows the whole francs shown, so a few cents never read as a move.
        const whole = Math.round(change / 100) * 100;
        const { arrow, sign, tone, word } = directionOf(whole);
        const amount = fmt.amount(Math.abs(whole), { isWhole: true });
        const said = `${label}: ${word === 'unchanged' ? word : `${word} CHF ${amount}`} since the end of ${since}`;
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

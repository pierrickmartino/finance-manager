'use client';

/*
 * PROTOTYPE — throwaway. Variant B: the mix, not the size. Every period is one row: its label,
 * a 100% track split by each series' share, and its total. Reads composition shifts over a
 * whole year in a small card; sizes live in the numbers on the right.
 */

import Link from 'next/link';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { latestFull, magnitude, seriesByKey, shortLabel, toStacks } from './helpers';

export const VARIANT_B_NAME = 'Mix rows (100%)';

export function VariantB({ data, money }: { data: ChartSource; money: (n: number) => string }) {
  const stacks = toStacks(data);
  const byKey = seriesByKey(stacks);
  const marked = latestFull(stacks.periods);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {stacks.series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-3 rounded-sm ${s.tone}`} /> {s.label}
          </span>
        ))}
      </figcaption>
      <ol className="flex flex-col gap-1.5">
        {stacks.periods.map((period, i) => {
          const whole = magnitude(period) || 1;
          return (
            <li
              key={period.label}
              className={`grid grid-cols-[2.5rem_1fr_6rem] items-center gap-3 rounded-lg px-1 ${i === marked ? 'bg-accent-tint' : ''}`}
            >
              <span className={`text-xs ${i === marked ? 'font-medium text-ink' : 'text-muted'}`}>
                {shortLabel(period.label)}
              </span>
              <span
                className={`flex h-3 gap-px overflow-hidden rounded-full ${period.isPartial ? 'opacity-40' : ''}`}
              >
                {period.segments.map((s) => {
                  const series = byKey.get(s.key)!;
                  const label = `${period.label}, ${series.label}: ${money(s.value)} (${Math.round((Math.abs(s.value) / whole) * 100)}%)`;
                  const style = { width: `${(Math.abs(s.value) / whole) * 100}%` };
                  return s.href ? (
                    <Link
                      key={s.key}
                      href={s.href}
                      aria-label={label}
                      title={label}
                      className={`${series.tone} hover:opacity-80`}
                      style={style}
                    />
                  ) : (
                    <span key={s.key} title={label} className={series.tone} style={style} />
                  );
                })}
              </span>
              <Link href={period.href} className="text-right text-xs tabular-nums hover:underline">
                {money(period.total)}
                {period.isPartial && <span className="text-muted"> so far</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

'use client';

/*
 * PROTOTYPE — throwaway. Variant C: one period at a time. A strip of small total columns picks
 * the period (the latest full one to start, accent-marked); below it, that period's stack laid
 * flat as one wide labelled bar, then each part with its amount and change on the period before.
 */

import Link from 'next/link';
import { useState } from 'react';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { latestFull, magnitude, seriesByKey, shortLabel, toStacks } from './helpers';

export const VARIANT_C_NAME = 'Pick a period, see its parts';

export function VariantC({ data, money }: { data: ChartSource; money: (n: number) => string }) {
  const stacks = toStacks(data);
  const byKey = seriesByKey(stacks);
  const [picked, setPicked] = useState<number | null>(null);
  const index = picked ?? latestFull(stacks.periods);
  const period = stacks.periods[index];
  if (!period) return null;
  const previous = stacks.periods[index - 1];
  const whole = magnitude(period) || 1;
  const max = Math.max(1, ...stacks.periods.map(magnitude));

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Period" className="flex h-14 items-end gap-1">
        {stacks.periods.map((p, i) => (
          <button
            key={p.label}
            type="button"
            role="radio"
            aria-checked={i === index}
            aria-label={`${p.label}: ${money(p.total)}`}
            title={`${p.label}: ${money(p.total)}`}
            onClick={() => setPicked(i)}
            className="group flex h-full flex-1 flex-col justify-end"
          >
            <span
              className={`w-full rounded-sm ${i === index ? 'bg-accent' : 'bg-hero-mist group-hover:bg-hero-glow'} ${p.isPartial ? 'opacity-50' : ''}`}
              style={{ height: `${Math.max(6, (magnitude(p) / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted" aria-hidden>
        <span>{shortLabel(stacks.periods[0]!.label)}</span>
        <span>{shortLabel(stacks.periods.at(-1)!.label)}</span>
      </div>

      <div>
        <p className="text-sm text-muted">
          {period.label}
          {period.isPartial && ' (so far)'}
        </p>
        <div className="mt-2 flex h-6 gap-0.5 overflow-hidden rounded-lg">
          {period.segments.map((s) => (
            <span
              key={s.key}
              className={byKey.get(s.key)!.tone}
              style={{ width: `${(Math.abs(s.value) / whole) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-rule">
        {period.segments.map((s) => {
          const series = byKey.get(s.key)!;
          const before = previous?.segments.find((p) => p.key === s.key)?.value;
          // Change in size, so more spending reads as "+" too.
          const change =
            before === undefined || before === 0
              ? null
              : (Math.abs(s.value) - Math.abs(before)) / Math.abs(before);
          const row = (
            <span className="grid grid-cols-[auto_1fr_auto_3.5rem] items-center gap-3 py-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${series.tone}`} />
              <span className="truncate">{series.label}</span>
              <span className="tabular-nums">{money(s.value)}</span>
              <span className="text-right text-xs text-muted tabular-nums">
                {change === null ? '' : `${change >= 0 ? '+' : ''}${Math.round(change * 100)}%`}
              </span>
            </span>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className="block hover:bg-sunken">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

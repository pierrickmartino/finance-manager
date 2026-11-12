'use client';

/*
 * PROTOTYPE — throwaway. Variant D: the stack taken apart. Each series gets its own lane of
 * small bars on a shared period axis and a shared scale, with its total on the right, so each
 * part's own trend reads without sitting on top of another. Lanes are named, so one tone does. A thin total lane closes the card.
 */

import Link from 'next/link';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { magnitude, shortLabel, toStacks } from './helpers';

export const VARIANT_D_NAME = 'Series lanes';

export function VariantD({ data, money }: { data: ChartSource; money: (n: number) => string }) {
  const stacks = toStacks(data, 6);
  const max = Math.max(
    1,
    ...stacks.periods.flatMap((p) => p.segments.map((s) => Math.abs(s.value))),
  );
  const maxTotal = Math.max(1, ...stacks.periods.map(magnitude));

  return (
    <figure className="flex flex-col gap-2">
      {stacks.series.map((series, lane) => (
        <div key={series.key} className="grid grid-cols-[6rem_1fr_5.5rem] items-end gap-3">
          <span className="truncate pb-0.5 text-xs text-ink-soft">{series.label}</span>
          <span className="flex h-8 items-end gap-0.5 border-b border-rule">
            {stacks.periods.map((period) => {
              const segment = period.segments[lane]!;
              const label = `${series.label}, ${period.label}: ${money(segment.value)}`;
              const className = `flex-1 rounded-t-sm bg-hero-mid ${period.isPartial ? 'opacity-40' : ''} hover:opacity-80`;
              const style = { height: `${Math.max(2, (Math.abs(segment.value) / max) * 100)}%` };
              return segment.href ? (
                <Link
                  key={period.label}
                  href={segment.href}
                  aria-label={label}
                  title={label}
                  className={className}
                  style={style}
                />
              ) : (
                <span key={period.label} title={label} className={className} style={style} />
              );
            })}
          </span>
          <span className="pb-0.5 text-right text-xs tabular-nums">{money(series.total)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[6rem_1fr_5.5rem] items-end gap-3 pt-2">
        <span className="pb-0.5 text-xs font-medium">Total</span>
        <span className="flex h-12 items-end gap-0.5">
          {stacks.periods.map((period) => (
            <Link
              key={period.label}
              href={period.href}
              aria-label={`${period.label}: ${money(period.total)}`}
              title={`${period.label}: ${money(period.total)}`}
              className={`flex-1 rounded-t-sm bg-ink ${period.isPartial ? 'opacity-30' : ''} hover:opacity-80`}
              style={{ height: `${Math.max(2, (magnitude(period) / maxTotal) * 100)}%` }}
            />
          ))}
        </span>
        <span className="pb-0.5 text-right text-xs font-medium tabular-nums">
          {money(data.total ?? 0)}
        </span>
      </div>
      <div className="grid grid-cols-[6rem_1fr_5.5rem] gap-3 text-xs text-muted" aria-hidden>
        <span />
        <span className="flex justify-between">
          <span>{shortLabel(stacks.periods[0]!.label)}</span>
          <span>{shortLabel(stacks.periods.at(-1)!.label)}</span>
        </span>
      </div>
    </figure>
  );
}

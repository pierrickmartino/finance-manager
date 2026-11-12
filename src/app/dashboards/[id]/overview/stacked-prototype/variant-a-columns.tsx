'use client';

/*
 * PROTOTYPE — throwaway. Variant A: the latest six periods as stacked columns in the hero's
 * navy, the latest full period labelled. Positive parts rise from the baseline, negative ones
 * hang below it. Each segment drills down. The legend sits under the columns.
 */

import Link from 'next/link';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { latestFull, seriesByKey, shortLabel, toStacks } from './helpers';

export const VARIANT_A_NAME = 'Stacked columns';

const PERIODS = 6;

export function VariantA({ data, money }: { data: ChartSource; money: (n: number) => string }) {
  const stacks = toStacks(data);
  const byKey = seriesByKey(stacks);
  const periods = stacks.periods.slice(-PERIODS);
  const marked = latestFull(periods);
  // Spending only (every value negative) rises from the baseline like any other stack; only a
  // mix of signs (income vs. expense) hangs the negative parts below it.
  const sign = periods.every((p) => p.segments.every((s) => s.value <= 0)) ? -1 : 1;
  const up = (p: (typeof periods)[number]) =>
    p.segments.reduce((t, s) => t + Math.max(0, sign * s.value), 0);
  const down = (p: (typeof periods)[number]) =>
    p.segments.reduce((t, s) => t + Math.max(0, -sign * s.value), 0);
  const maxUp = Math.max(0, ...periods.map(up));
  const maxDown = Math.max(0, ...periods.map(down));
  const span = maxUp + maxDown || 1;

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex h-56 gap-3 pt-8">
        {periods.map((period, i) => (
          <div key={period.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full flex-1 flex-col">
              {/* Above the baseline, the largest stack reaching the top. */}
              <div
                className="relative flex flex-col justify-end"
                style={{ height: `${(maxUp / span) * 100}%` }}
              >
                {i === marked && (
                  <span
                    className="absolute left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper"
                    style={{ bottom: `${(up(period) / (maxUp || 1)) * 100}%` }}
                  >
                    {money(period.total)}
                  </span>
                )}
                <div
                  className="flex flex-col-reverse gap-px overflow-hidden rounded-t-xl"
                  style={{ height: `${(up(period) / (maxUp || 1)) * 100}%` }}
                >
                  {period.segments
                    .filter((s) => sign * s.value > 0)
                    .map((s) => (
                      <Segment
                        key={s.key}
                        share={(sign * s.value) / up(period)}
                        tone={byKey.get(s.key)!.tone}
                        href={s.href}
                        label={`${period.label}, ${byKey.get(s.key)!.label}: ${money(s.value)}`}
                        isPartial={period.isPartial}
                      />
                    ))}
                </div>
              </div>
              {maxDown > 0 && maxUp > 0 && <div className="h-px bg-ink" />}
              <div className="flex flex-col" style={{ height: `${(maxDown / span) * 100}%` }}>
                <div
                  className="flex flex-col gap-px overflow-hidden rounded-b-xl"
                  style={{ height: `${(down(period) / (maxDown || 1)) * 100}%` }}
                >
                  {period.segments
                    .filter((s) => sign * s.value < 0)
                    .map((s) => (
                      <Segment
                        key={s.key}
                        share={(-sign * s.value) / down(period)}
                        tone={byKey.get(s.key)!.tone}
                        href={s.href}
                        label={`${period.label}, ${byKey.get(s.key)!.label}: ${money(s.value)}`}
                        isPartial={period.isPartial}
                      />
                    ))}
                </div>
              </div>
            </div>
            <span className={`text-xs ${i === marked ? 'font-medium text-ink' : 'text-muted'}`}>
              {shortLabel(period.label)}
              {period.isPartial && '*'}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {stacks.series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.tone}`} /> {s.label}
          </span>
        ))}
        {periods.some((p) => p.isPartial) && <span>* still running</span>}
      </figcaption>
    </figure>
  );
}

function Segment({
  share,
  tone,
  href,
  label,
  isPartial,
}: {
  share: number;
  tone: string;
  href: string | null;
  label: string;
  isPartial: boolean;
}) {
  const className = `block w-full shrink-0 ${tone} ${isPartial ? 'opacity-40' : ''} hover:opacity-80`;
  const style = { height: `${share * 100}%` };
  return href ? (
    <Link href={href} aria-label={label} title={label} className={className} style={style} />
  ) : (
    <span title={label} className={className} style={style} />
  );
}

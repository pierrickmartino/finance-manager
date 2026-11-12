/*
 * PROTOTYPE — throwaway. Shared shaping for the stacked-bar card variants: the engine's table as
 * periods of segments, the largest series kept and the rest folded into "Other".
 */

import type { ChartSource } from '@/lib/reporting/chart-data';

/** A card has room for a few hues of navy, not eight: the rest fold into "Other". */
export const CARD_SERIES = 4;

/** Navy ramp from the hero, darkest first; "Other" is faint. Literal classes for Tailwind. */
export const TONES = ['bg-hero-deep', 'bg-hero-mid', 'bg-hero-glow', 'bg-hero-mist'] as const;
export const OTHER_TONE = 'bg-faint';

export interface StackSeries {
  key: string;
  label: string;
  tone: string;
  total: number;
}

export interface StackSegment {
  key: string;
  value: number;
  href: string | null;
}

export interface StackPeriod {
  label: string;
  isPartial: boolean;
  total: number;
  href: string;
  segments: StackSegment[];
}

export interface Stacks {
  series: StackSeries[];
  periods: StackPeriod[];
}

const OTHER = 'other';

/** The columns ranked by magnitude, the top `CARD_SERIES - 1` kept when there are more. */
export function toStacks(data: ChartSource, limit = CARD_SERIES): Stacks {
  const ranked = data.columns
    .map((column, index) => ({ column, index, total: data.columnTotals[index] ?? 0 }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const isFolded = ranked.length > limit;
  const kept = isFolded ? ranked.slice(0, limit - 1) : ranked;
  const folded = isFolded ? ranked.slice(limit - 1) : [];
  // Keep the engine's column order among the kept ones, so colours stay put between periods.
  kept.sort((a, b) => a.index - b.index);

  const series: StackSeries[] = kept.map((entry, i) => ({
    key: `c${entry.index}`,
    label: entry.column.label,
    tone: TONES[i % TONES.length]!,
    total: entry.total,
  }));
  if (isFolded)
    series.push({
      key: OTHER,
      label: `Other (${folded.length})`,
      tone: OTHER_TONE,
      total: folded.reduce((t, e) => t + e.total, 0),
    });

  const periods = data.rows.map((row, r) => {
    const cells = data.cells[r] ?? [];
    const segments: StackSegment[] = kept.map((entry) => ({
      key: `c${entry.index}`,
      value: cells[entry.index] ?? 0,
      href: data.hrefs.cells[r]?.[entry.index] ?? null,
    }));
    if (isFolded)
      segments.push({
        key: OTHER,
        value: folded.reduce((t, e) => t + (cells[e.index] ?? 0), 0),
        href: null,
      });
    return {
      label: row.label,
      isPartial: row.isPartial,
      total: data.rowTotals[r] ?? 0,
      href: data.hrefs.rowTotals[r] ?? data.hrefs.total,
      segments,
    };
  });
  return { series, periods };
}

export function seriesByKey(stacks: Stacks): Map<string, StackSeries> {
  return new Map(stacks.series.map((s) => [s.key, s]));
}

/** "Oct 2026" → "Oct". */
export const shortLabel = (label: string): string => label.split(' ')[0] ?? label;

export const magnitude = (period: StackPeriod): number =>
  period.segments.reduce((t, s) => t + Math.abs(s.value), 0);

export function latestFull(periods: StackPeriod[]): number {
  const index = periods.findLastIndex((p) => !p.isPartial);
  return index === -1 ? periods.length - 1 : index;
}

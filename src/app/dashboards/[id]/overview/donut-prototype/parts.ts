/*
 * PROTOTYPE — throwaway. What every donut variant draws: the parts of the whole, largest first,
 * each with its colour. `?sample=` swaps in made-up parts; `?palette=` picks the colours.
 */

import { CHART_PALETTE } from '../../../chart-palette';
import { OTHER_LABEL, type ChartSource } from '@/lib/reporting/chart-data';
import { shareParts } from '@/lib/reporting/story';

export const IS_DONUT_PROTOTYPE_ENABLED = process.env.NODE_ENV !== 'production';

export interface Part {
  label: string;
  /** Signed, in minor units: a refund in an expense breakdown stays negative. */
  value: number;
  /** Of the whole, by magnitude (0–1). */
  share: number;
  href: string | null;
  color: string;
  /** Text that reads on `color`. */
  ink: string;
}

export type SampleMode = 'real' | 'few' | 'many' | 'signed';
export const SAMPLE_MODES: SampleMode[] = ['real', 'few', 'many', 'signed'];
export type PaletteMode = 'navy' | 'categorical';
export const PALETTE_MODES: PaletteMode[] = ['navy', 'categorical'];

/** The hero's navy, darkest first (globals.css hero-* plus steps between them). */
const NAVY = ['#0a1630', '#1c3566', '#284a8a', '#3d64ad', '#4f78c4', '#7f9ed6', '#b7c7e6'];
const OTHER_COLOR = '#cdd3dd'; // rule-strong
const DARK_INK = '#141a2b';

function tone(index: number, label: string, palette: PaletteMode): { color: string; ink: string } {
  if (label === OTHER_LABEL) return { color: OTHER_COLOR, ink: DARK_INK };
  if (palette === 'categorical') {
    return { color: CHART_PALETTE.series[index % 8]!, ink: '#ffffff' };
  }
  const color = NAVY[index % NAVY.length]!;
  return { color, ink: index >= 5 ? DARK_INK : '#ffffff' };
}

const SAMPLES: Record<Exclude<SampleMode, 'real'>, [string, number][]> = {
  few: [
    ['Housing', 210000],
    ['Groceries', 64000],
    ['Transport', 21500],
  ],
  many: [
    ['Housing', 210000],
    ['Groceries', 64000],
    ['Insurance', 48000],
    ['Restaurants', 31200],
    ['Transport', 21500],
    ['Leisure', 17800],
    ['Health', 9400],
    [OTHER_LABEL, 15600],
  ],
  signed: [
    ['Housing', 210000],
    ['Groceries', 64000],
    ['Transport', 21500],
    ['Refunds', -18000],
    ['Leisure', 12000],
  ],
};

function fromEntries(entries: [string, number][]) {
  const whole = entries.reduce((sum, [, value]) => sum + Math.abs(value), 0);
  return entries
    .map(([label, value]) => ({
      label,
      value,
      share: whole === 0 ? 0 : Math.abs(value) / whole,
      href: null,
    }))
    .sort((a, b) => {
      if (a.label === OTHER_LABEL) return 1;
      if (b.label === OTHER_LABEL) return -1;
      return b.share - a.share;
    });
}

export function donutParts(data: ChartSource, sample: SampleMode, palette: PaletteMode): Part[] {
  const raw = sample === 'real' ? shareParts(data) : fromEntries(SAMPLES[sample]);
  // "Other" always reads last, whatever its size.
  const ordered = [
    ...raw.filter((part) => part.label !== OTHER_LABEL),
    ...raw.filter((part) => part.label === OTHER_LABEL),
  ];
  return ordered.map((part, index) => ({ ...part, ...tone(index, part.label, palette) }));
}

export function percent(share: number): string {
  const value = share * 100;
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
}

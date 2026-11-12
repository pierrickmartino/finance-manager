'use client';

/*
 * PROTOTYPE — throwaway (.claude/skills/prototype/UI.md, sub-shape A).
 * Four new visualisations for Donut Widgets on the Dashboard's cards, beside the current tick
 * list, switchable via `?variant=current|A|B|C|D` on the existing /dashboards/[id] route.
 * `?sample=real|few|many|signed` swaps in made-up parts; `?palette=navy|categorical` picks the
 * colours. Only Donut Widgets change. Delete this folder once a variant has won.
 */

import { useSearchParams } from 'next/navigation';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { TickList } from '../marks';
import {
  donutParts,
  PALETTE_MODES,
  SAMPLE_MODES,
  type PaletteMode,
  type SampleMode,
} from './parts';
import { VARIANT_A_NAME, VariantA } from './variant-a-ring';
import { VARIANT_B_NAME, VariantB } from './variant-b-band';
import { VARIANT_C_NAME, VariantC } from './variant-c-waffle';
import { VARIANT_D_NAME, VariantD } from './variant-d-treemap';

const VARIANTS = [
  { key: 'current', name: 'Current tick list' },
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
  { key: 'D', name: VARIANT_D_NAME },
];

function pick<T extends string>(value: string | null, allowed: T[]): T {
  return allowed.includes(value as T) ? (value as T) : allowed[0]!;
}

export function DonutPrototype({
  data,
  money,
}: {
  data: ChartSource;
  money: (minor: number) => string;
}) {
  const params = useSearchParams();
  const variant = params.get('variant') ?? 'current';
  const sample = pick<SampleMode>(params.get('sample'), SAMPLE_MODES);
  const palette = pick<PaletteMode>(params.get('palette'), PALETTE_MODES);
  const parts = donutParts(data, sample, palette);
  if (parts.length === 0)
    return <p className="text-muted">No data in this date range yet. Try ?sample=many.</p>;
  const total =
    sample === 'real' ? (data.total ?? 0) : parts.reduce((sum, part) => sum + part.value, 0);
  const props = { parts, total, money };
  switch (variant) {
    case 'A':
      return <VariantA {...props} />;
    case 'B':
      return <VariantB {...props} />;
    case 'C':
      return <VariantC {...props} />;
    case 'D':
      return <VariantD {...props} />;
    default:
      return (
        <TickList
          items={parts.map((part) => ({
            key: part.label,
            title: part.label,
            detail: money(part.value),
            share: part.share,
            href: part.href,
          }))}
        />
      );
  }
}

export function DonutPrototypeSwitcher() {
  return (
    <PrototypeSwitcher
      variants={VARIANTS}
      toggles={[
        { param: 'sample', values: SAMPLE_MODES },
        { param: 'palette', values: PALETTE_MODES },
      ]}
    />
  );
}

'use client';

/*
 * PROTOTYPE — throwaway (.claude/skills/prototype/UI.md, sub-shape A).
 * Four card visualisations for a stacked-bar Widget beside the current one, inside the existing
 * Dashboard card on /dashboards/[id] (and Edit mode), switchable via `?variant=`; `?sample=`
 * swaps every stacked-bar card's data for made-up data (categories | many | flows | real).
 * Delete this folder, the switcher and the hooks in widget-card.tsx / widget-board.tsx once a
 * variant has won.
 */

import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import type { ChartSource } from '@/lib/reporting/chart-data';
import type { StoryChapter } from '../../story/chapter';
import { sampleData, SAMPLE_MODES, type SampleMode } from './sample';
import { VARIANT_A_NAME, VariantA } from './variant-a-columns';
import { VARIANT_B_NAME, VariantB } from './variant-b-mix';
import { VARIANT_C_NAME, VariantC } from './variant-c-breakdown';
import { VARIANT_D_NAME, VariantD } from './variant-d-lanes';

export const IS_PROTOTYPE_ENABLED = process.env.NODE_ENV !== 'production';

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
  { key: 'D', name: VARIANT_D_NAME },
  { key: 'current', name: 'Current card' },
];

const isStacked = (chapter: StoryChapter): boolean =>
  IS_PROTOTYPE_ENABLED && chapter.source === 'query' && chapter.visualisation === 'stacked_bar';

/** The chapter as the card should see it: sample data swapped in for stacked bars. */
export function usePrototypeChapter<T extends StoryChapter>(chapter: T): T {
  const params = useSearchParams();
  if (!isStacked(chapter)) return chapter;
  const mode = (params.get('sample') ?? 'categories') as SampleMode;
  if (mode === 'real' || !SAMPLE_MODES.includes(mode)) return chapter;
  return { ...chapter, data: sampleData(mode), error: null, unconvertedCount: 0 };
}

/** A variant's body for a stacked-bar card, or null to draw the current one. */
export function usePrototypeBody(
  chapter: StoryChapter,
  money: (n: number) => string,
): ReactNode | null {
  const params = useSearchParams();
  const variant = params.get('variant') ?? 'A';
  const data: ChartSource | null = chapter.data;
  if (!isStacked(chapter) || !data || data.rows.length === 0 || variant === 'current') return null;
  if (variant === 'A') return <VariantA data={data} money={money} />;
  if (variant === 'B') return <VariantB data={data} money={money} />;
  if (variant === 'C') return <VariantC key={chapter.id} data={data} money={money} />;
  if (variant === 'D') return <VariantD data={data} money={money} />;
  return null;
}

export function StackedPrototypeSwitcher({ chapters }: { chapters: StoryChapter[] }) {
  if (!chapters.some(isStacked)) return null;
  return (
    <PrototypeSwitcher variants={VARIANTS} toggles={[{ param: 'sample', values: SAMPLE_MODES }]} />
  );
}

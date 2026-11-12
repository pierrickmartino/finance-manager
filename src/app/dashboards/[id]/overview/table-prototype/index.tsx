'use client';

/*
 * PROTOTYPE — throwaway (.claude/skills/prototype/UI.md).
 *
 * Question: how should a "table" Widget look as a card on the Dashboard?
 * Plan: four variants beside the current share list, on the existing /dashboards/[id] route,
 * switchable via ?variant=current|A|B|C|D and the floating bar. ?sample=on|off appends two
 * made-up table Widgets (wide: Categories × months; narrow: one column) under the real ones.
 * Only Widgets whose visualisation is "table" change; every other card stays as it is.
 */

import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { StoryChapter } from '../../story/chapter';
import { IS_TABLE_PROTOTYPE_ENABLED } from './config';
import { HeatmapTable } from './variant-a-heatmap';
import { SparkRows } from './variant-b-spark-rows';
import { FocusColumn } from './variant-c-focus-column';
import { CompactPivot } from './variant-d-compact-pivot';

/** The variant's body for a table Widget, or null to keep the card's current body. */
export function useTableVariantBody(chapter: StoryChapter): ReactNode | null {
  const params = useSearchParams();
  const variant = params.get('variant') ?? 'current';
  const { data } = chapter;
  if (!IS_TABLE_PROTOTYPE_ENABLED || chapter.visualisation !== 'table') return null;
  if (!data || data.rows.length === 0) return null;
  switch (variant) {
    case 'A':
      return <HeatmapTable data={data} />;
    case 'B':
      return <SparkRows data={data} />;
    case 'C':
      return <FocusColumn data={data} />;
    case 'D':
      return <CompactPivot data={data} widgetId={chapter.id} />;
    default:
      return null;
  }
}

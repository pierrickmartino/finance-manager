/*
 * PROTOTYPE — throwaway (.claude/skills/prototype/UI.md, sub-shape A).
 * Four redesigns of the home Dashboard's "Accounts need attention" notice beside the current one,
 * switchable via `?variant=` on the existing /dashboards/[id] route; `?sample=` swaps in made-up
 * entries (attention | ok | real). Delete this folder once a variant has won.
 */

import { Suspense } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry } from '@/server/services/completeness';
import { CompletenessNotice } from '../completeness-notice';
import { sampleEntries, type SampleMode } from './sample';
import { VARIANT_A_NAME, VariantA } from './variant-a-triage';
import { VARIANT_B_NAME, VariantB } from './variant-b-timeline';
import { VARIANT_C_NAME, VariantC } from './variant-c-grouped';
import { VARIANT_D_NAME, VariantD } from './variant-d-next-step';

const VARIANTS = [
  { key: 'current', name: 'Current notice' },
  { key: 'A', name: VARIANT_A_NAME },
  { key: 'B', name: VARIANT_B_NAME },
  { key: 'C', name: VARIANT_C_NAME },
  { key: 'D', name: VARIANT_D_NAME },
];

export const IS_PROTOTYPE_ENABLED = process.env.NODE_ENV !== 'production';

export function AttentionPrototype({
  realEntries,
  variant,
  sample,
  fmt,
  today,
}: {
  realEntries: CompletenessEntry[];
  variant: string | undefined;
  sample: string | undefined;
  fmt: Formatter;
  today: string;
}) {
  const mode: SampleMode = sample === 'ok' || sample === 'real' ? sample : 'attention';
  const entries = mode === 'real' ? realEntries : sampleEntries(mode, today);
  const key = variant ?? 'A';
  return (
    <>
      {key === 'current' && <CompletenessNotice entries={entries} fmt={fmt} />}
      {key === 'A' && <VariantA entries={entries} fmt={fmt} />}
      {key === 'B' && <VariantB entries={entries} fmt={fmt} today={today} />}
      {key === 'C' && <VariantC entries={entries} fmt={fmt} />}
      {key === 'D' && <VariantD entries={entries} fmt={fmt} />}
      <Suspense>
        <PrototypeSwitcher
          variants={VARIANTS}
          toggles={[{ param: 'sample', values: ['attention', 'ok', 'real'] }]}
        />
      </Suspense>
    </>
  );
}

'use client';

/**
 * PROTOTYPE (throwaway): three radically different Dashboard visualisations on the existing
 * /dashboards/[id] route, switchable via `?variant=` (none → the current grid).
 *   A  Aurora   dark glass bento, glow charts, count-up KPIs, tilt cards
 *   B  Story    editorial scroll narrative, one chapter per Widget
 *   C  Cockpit  mission-control HUD, one focus stage with switchable lenses
 */
import type { SwitcherVariant } from '@/components/prototype-switcher';
import type { ProtoProps } from './data';
import { VariantAurora } from './variant-a-aurora';
import { VariantStory } from './variant-b-story';
import { VariantCockpit } from './variant-c-cockpit';

export const PROTOTYPE_VARIANTS: SwitcherVariant[] = [
  { key: 'current', name: 'Current grid' },
  { key: 'A', name: 'Aurora' },
  { key: 'B', name: 'Story' },
  { key: 'C', name: 'Cockpit' },
];

export function PrototypeVariant({ variant, ...props }: ProtoProps & { variant: string }) {
  if (variant === 'A') return <VariantAurora {...props} />;
  if (variant === 'B') return <VariantStory {...props} />;
  if (variant === 'C') return <VariantCockpit {...props} />;
  return null;
}

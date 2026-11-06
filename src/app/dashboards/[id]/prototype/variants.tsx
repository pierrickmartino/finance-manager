'use client';

/**
 * PROTOTYPE (throwaway): three radically different Dashboard visualisations on the existing
 * /dashboards/[id] route, switchable via `?variant=` (none → the current grid).
 *   A  Aurora   dark glass bento, glow charts, count-up KPIs, tilt cards
 *   B  Story    editorial scroll narrative, one chapter per Widget
 *   C  Cockpit  mission-control HUD, one focus stage with switchable lenses
 * Light only:
 *   D  Tide        the year as one river; scrub it to read any month
 *   E  Poster      Swiss poster, a self-assembling dot matrix of month × Category
 *   F  Sketchbook  hand-drawn charts on a notebook spread that sketch themselves
 */
import type { SwitcherVariant } from '@/components/prototype-switcher';
import type { ProtoProps } from './data';
import { VariantAurora } from './variant-a-aurora';
import { VariantStory } from './variant-b-story';
import { VariantCockpit } from './variant-c-cockpit';
import { VariantTide } from './variant-d-tide';
import { VariantPoster } from './variant-e-poster';
import { VariantSketchbook } from './variant-f-sketchbook';

export const PROTOTYPE_VARIANTS: SwitcherVariant[] = [
  { key: 'current', name: 'Current grid' },
  { key: 'A', name: 'Aurora' },
  { key: 'B', name: 'Story' },
  { key: 'C', name: 'Cockpit' },
  { key: 'D', name: 'Tide' },
  { key: 'E', name: 'Poster' },
  { key: 'F', name: 'Sketchbook' },
];

export function PrototypeVariant({ variant, ...props }: ProtoProps & { variant: string }) {
  if (variant === 'A') return <VariantAurora {...props} />;
  if (variant === 'B') return <VariantStory {...props} />;
  if (variant === 'C') return <VariantCockpit {...props} />;
  if (variant === 'D') return <VariantTide {...props} />;
  if (variant === 'E') return <VariantPoster {...props} />;
  if (variant === 'F') return <VariantSketchbook {...props} />;
  return null;
}

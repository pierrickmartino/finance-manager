'use client';

/**
 * PROTOTYPE (throwaway): "Three redesigns of the Dashboard, inspired by a reference
 * screenshot, switchable via `?variant=` on the existing `/dashboards/[id]` route."
 * A = today's Dashboard Story (baseline); B, C, D = the redesigns. See ./README.md.
 */
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { deriveFigures } from './prototype-data';
import { VariantBento, type VariantProps } from './variant-bento';
import { VariantCockpit } from './variant-cockpit';
import { VariantLedger } from './variant-ledger';
import type { StoryChapter } from '../story/chapter';

export const VARIANTS = [
  { key: 'A', name: 'Story (current)' },
  { key: 'B', name: 'Teal bento' },
  { key: 'C', name: 'Cockpit' },
  { key: 'D', name: 'Month ledger' },
];

interface DashboardVariantsProps extends Omit<VariantProps, 'figures'> {
  variant: string;
  chapters: StoryChapter[];
}

export function DashboardVariants({ variant, chapters, ...rest }: DashboardVariantsProps) {
  const props = { ...rest, figures: deriveFigures(chapters) };
  return (
    <>
      {variant === 'B' && <VariantBento {...props} />}
      {variant === 'C' && <VariantCockpit {...props} />}
      {variant === 'D' && <VariantLedger {...props} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}

export function BaselineSwitcher() {
  return <PrototypeSwitcher variants={VARIANTS} current="A" />;
}

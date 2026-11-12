/**
 * PROTOTYPE (layout redesign): which variant `?variant=` asks for. "current" is today's design,
 * kept in the cycle for comparison. Throwaway; see ./README.md.
 */
import type { PrototypeVariant } from '@/components/prototype-switcher';

export type LayoutVariant = 'current' | 'A' | 'B' | 'C';

export const LAYOUT_VARIANTS: PrototypeVariant[] = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: 'Midnight: navy, amber, Inter' },
  { key: 'B', name: 'Graphite: charcoal, lime, Geist' },
  { key: 'C', name: 'Forest: green, copper, Newsreader' },
];

export function parseVariant(value: string | null | undefined): LayoutVariant {
  if (process.env.NODE_ENV === 'production') return 'current';
  return value === 'A' || value === 'B' || value === 'C' ? value : 'current';
}

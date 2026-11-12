/**
 * PROTOTYPE (layout redesign): which variant `?variant=` asks for. "current" is today's design,
 * kept in the cycle for comparison. Throwaway; see ./README.md.
 */
import type { PrototypeVariant } from '@/components/prototype-switcher';

export type LayoutVariant = 'current' | 'A' | 'B' | 'C';

export const LAYOUT_VARIANTS: PrototypeVariant[] = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: 'Ledger: sidebar, hairline grid' },
  { key: 'B', name: 'Command: graphite bar, side rail' },
  { key: 'C', name: 'Broadsheet: masthead, columns' },
];

export function parseVariant(value: string | null | undefined): LayoutVariant {
  if (process.env.NODE_ENV === 'production') return 'current';
  return value === 'A' || value === 'B' || value === 'C' ? value : 'current';
}

/** Keeps the variant when following a link, so every page can be seen in the variant's shell. */
export function withVariant(href: string, variant: LayoutVariant): string {
  if (variant === 'current') return href;
  return `${href}${href.includes('?') ? '&' : '?'}variant=${variant}`;
}

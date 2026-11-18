/**
 * PROTOTYPE (Tremor redesign), throwaway: the ?variant= keys of the app-wide Tremor prototype.
 * The shell, the Dashboard and the Transactions list each draw their own take on A, B and C;
 * `current` is today's Midnight design, for comparison. The choice also lives in a cookie so it
 * survives navigating between pages (the app's own links don't carry ?variant=).
 */
export const PROTOTYPE_VARIANTS = [
  { key: 'A', name: 'Sidebar workspace' },
  { key: 'B', name: 'Report tabs' },
  { key: 'C', name: 'Icon rail + inspector' },
  { key: 'current', name: 'Current Midnight' },
] as const;

export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number]['key'];

export const PROTOTYPE_COOKIE = 'fm_prototype_variant';
export const DEFAULT_VARIANT: PrototypeVariant = 'A';

export const isPrototypeEnabled = process.env.NODE_ENV !== 'production';

export function parseVariant(value: string | null | undefined): PrototypeVariant | null {
  return PROTOTYPE_VARIANTS.find((v) => v.key === value)?.key ?? null;
}

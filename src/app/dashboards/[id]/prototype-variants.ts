/**
 * PROTOTYPE — throwaway. Question: what should the Dashboard look like, taking a bento-style
 * finance dashboard (hero greeting, KPI card, dot-matrix cash flow, insight callout, spending
 * bars, recent activity, highlighted performance bars) as inspiration?
 *
 * Three variants on the existing /dashboards/[id] route, picked with `?variant=`:
 * - A: the current Dashboard Story (baseline)
 * - B: Bento: fixed slots in a three-column grid, teal like the inspiration
 * - C: Focus: a KPI strip, then one Widget at a time beside a list of the others, ink and vermilion
 *
 * Off in production builds: there the page always renders A.
 */
export const PROTOTYPE_VARIANTS = [
  { key: 'A', name: 'Story (current)' },
  { key: 'B', name: 'Bento' },
  { key: 'C', name: 'Focus' },
] as const;

export type PrototypeVariantKey = (typeof PROTOTYPE_VARIANTS)[number]['key'];

export const PROTOTYPE_VARIANT_PARAM = 'variant';

export const IS_PROTOTYPE_ENABLED = process.env.NODE_ENV !== 'production';

export function parseVariant(value: string | string[] | undefined): PrototypeVariantKey {
  if (!IS_PROTOTYPE_ENABLED) return 'A';
  const key = Array.isArray(value) ? value[0] : value;
  return PROTOTYPE_VARIANTS.find((variant) => variant.key === key)?.key ?? 'A';
}

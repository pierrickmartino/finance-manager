/**
 * PROTOTYPE — throwaway. Question: "What should the app's layout look like?", inspired by a
 * hero-led, top-navigation finance dashboard. Four shells on every route, picked with
 * `?layout=` (remembered in a cookie so it survives navigation) and cycled from the floating
 * bar at the bottom of the screen. Fold the winner into app-shell.tsx, then delete every
 * `prototype-*` file.
 */
export const PROTOTYPE_LAYOUTS = [
  { key: 'A', name: 'Current sidebar' },
  { key: 'B', name: 'Hero canvas + top pills' },
  { key: 'C', name: 'Floating dock' },
  { key: 'D', name: 'Two-tier tabs' },
] as const;

export type PrototypeLayoutKey = (typeof PROTOTYPE_LAYOUTS)[number]['key'];

export const PROTOTYPE_LAYOUT_COOKIE = 'prototype-layout';
export const PROTOTYPE_LAYOUT_PARAM = 'layout';

/** Never in a production build: a stray merge can't ship the variants or the bar. */
export const IS_PROTOTYPE_ENABLED = process.env.NODE_ENV !== 'production';

export function parsePrototypeLayout(value: string | null | undefined): PrototypeLayoutKey | null {
  if (!IS_PROTOTYPE_ENABLED) return null;
  const match = PROTOTYPE_LAYOUTS.find((layout) => layout.key === value?.toUpperCase());
  return match ? match.key : null;
}

/** "Good morning" by the browser's clock (the server's would be wrong for the user). */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The deep-teal hero of the inspiration screenshot. Prototype-only colours, not tokens yet. */
export const HERO_GRADIENT =
  'radial-gradient(120% 90% at 85% 10%, #3b8597 0%, rgba(59,133,151,0) 55%), radial-gradient(90% 120% at 0% 0%, #0a2f3c 0%, #0f4a5c 45%, rgba(15,74,92,0) 100%), linear-gradient(180deg, #0f4352 0%, #1f6577 38%, #a9c7cf 72%, #f3f5f6 100%)';

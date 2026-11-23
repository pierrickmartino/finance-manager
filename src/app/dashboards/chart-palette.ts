/**
 * Chart colours for categorical series: several Categories or Accounts on one bars, line, area
 * or Donut Widget, their legends, and a Transaction's Split lines (`lineColor`). Not the ramp:
 * that cyan → violet scale draws the Dashboard's cards, and these hues are a separate order.
 *
 * The eight hues lead with the neon ones (cyan, blue, teal, violet) and fill in with warm ones
 * (the retired amber, a magenta, a pink, a coral) so neighbouring series never collide: each
 * adjacent pair, the last against the first included, clears ΔE 8 (CIEDE2000) under simulated
 * protan, deutan and tritan vision, and every hue reaches 3:1 against `surface`
 * (`src/lib/color/design-tokens.test.ts` proves both). Assign slots in order; a ninth series folds
 * into "Other" (`MAX_SERIES` in chart-data). Text never takes a series colour, and no series is
 * the accent. Text, grid and surface are the design system's dark `muted`, `rule` and `surface`
 * tokens (globals.css); the app is dark only (ADR-0017), so there is one palette.
 */
export const CHART_PALETTE = {
  series: ['#2fd5f0', '#3b82f6', '#2dd4bf', '#a78bfa', '#f5a623', '#d946ef', '#f9a8d4', '#f9734e'],
  text: '#94a1bd',
  grid: '#243150',
  surface: '#111a2e',
} as const;

export type ChartPalette = typeof CHART_PALETTE;

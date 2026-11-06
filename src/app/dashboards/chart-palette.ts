/**
 * Chart colours. The eight categorical hues are a validated colour-blind-safe order (adjacent
 * pairs clear ΔE 8 under simulated CVD). Assign slots in order; a ninth series folds into
 * "Other" (`MAX_SERIES` in chart-data). Text never takes a series colour. Text, grid and
 * surface are the design system's muted, rule and surface tokens (globals.css); the app is
 * light only, so there is one palette.
 */
export const CHART_PALETTE = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  text: '#71717a',
  grid: '#e4e4e7',
  surface: '#ffffff',
} as const;

export type ChartPalette = typeof CHART_PALETTE;

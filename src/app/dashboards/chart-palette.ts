'use client';

import { useSyncExternalStore } from 'react';

/**
 * Chart colours. The eight categorical hues are a validated colour-blind-safe order (adjacent
 * pairs clear ΔE 8 under simulated CVD); dark mode has its own steps of the same hues, chosen
 * for the dark surface rather than flipped. Assign slots in order; a ninth series folds into
 * "Other" (`MAX_SERIES` in chart-data). Text never takes a series colour.
 */
const LIGHT = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  text: '#52514e',
  grid: '#e4e4e7',
  surface: '#ffffff',
};

const DARK: ChartPalette = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  text: '#c3c2b7',
  grid: '#3f3f46',
  surface: '#09090b',
};

export type ChartPalette = typeof LIGHT;

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** The palette for the colour scheme in use (the app follows the system setting). */
export function useChartPalette(): ChartPalette {
  const isDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  return isDark ? DARK : LIGHT;
}

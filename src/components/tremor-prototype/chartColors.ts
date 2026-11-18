// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
// Tremor chartColors [v0.1.0]

export type ColorUtility = 'bg' | 'stroke' | 'fill' | 'text';

// Midnight chart colours: the hero navy ramp, the one accent, meaning, then CHART_PALETTE.
export const chartColors = {
  navy: {
    bg: 'bg-hero-mid',
    stroke: 'stroke-hero-mid',
    fill: 'fill-hero-mid',
    text: 'text-hero-mid',
  },
  deep: {
    bg: 'bg-hero-deep',
    stroke: 'stroke-hero-deep',
    fill: 'fill-hero-deep',
    text: 'text-hero-deep',
  },
  glow: {
    bg: 'bg-hero-glow',
    stroke: 'stroke-hero-glow',
    fill: 'fill-hero-glow',
    text: 'text-hero-glow',
  },
  mist: {
    bg: 'bg-hero-mist',
    stroke: 'stroke-hero-mist',
    fill: 'fill-hero-mist',
    text: 'text-hero-mist',
  },
  amber: { bg: 'bg-accent', stroke: 'stroke-accent', fill: 'fill-accent', text: 'text-accent' },
  positive: {
    bg: 'bg-positive',
    stroke: 'stroke-positive',
    fill: 'fill-positive',
    text: 'text-positive',
  },
  negative: {
    bg: 'bg-negative',
    stroke: 'stroke-negative',
    fill: 'fill-negative',
    text: 'text-negative',
  },
  rule: {
    bg: 'bg-rule-strong',
    stroke: 'stroke-rule-strong',
    fill: 'fill-rule-strong',
    text: 'text-rule-strong',
  },
  s1: {
    bg: 'bg-[#2a78d6]',
    stroke: 'stroke-[#2a78d6]',
    fill: 'fill-[#2a78d6]',
    text: 'text-[#2a78d6]',
  },
  s2: {
    bg: 'bg-[#eb6834]',
    stroke: 'stroke-[#eb6834]',
    fill: 'fill-[#eb6834]',
    text: 'text-[#eb6834]',
  },
  s3: {
    bg: 'bg-[#1baf7a]',
    stroke: 'stroke-[#1baf7a]',
    fill: 'fill-[#1baf7a]',
    text: 'text-[#1baf7a]',
  },
  s4: {
    bg: 'bg-[#eda100]',
    stroke: 'stroke-[#eda100]',
    fill: 'fill-[#eda100]',
    text: 'text-[#eda100]',
  },
  s5: {
    bg: 'bg-[#e87ba4]',
    stroke: 'stroke-[#e87ba4]',
    fill: 'fill-[#e87ba4]',
    text: 'text-[#e87ba4]',
  },
  s6: {
    bg: 'bg-[#008300]',
    stroke: 'stroke-[#008300]',
    fill: 'fill-[#008300]',
    text: 'text-[#008300]',
  },
  s7: {
    bg: 'bg-[#6250d6]',
    stroke: 'stroke-[#6250d6]',
    fill: 'fill-[#6250d6]',
    text: 'text-[#6250d6]',
  },
  s8: {
    bg: 'bg-[#e34948]',
    stroke: 'stroke-[#e34948]',
    fill: 'fill-[#e34948]',
    text: 'text-[#e34948]',
  },
} as const satisfies {
  [color: string]: {
    [key in ColorUtility]: string;
  };
};

export type AvailableChartColorsKeys = keyof typeof chartColors;

export const AvailableChartColors: AvailableChartColorsKeys[] = Object.keys(
  chartColors,
) as Array<AvailableChartColorsKeys>;

export const constructCategoryColors = (
  categories: string[],
  colors: AvailableChartColorsKeys[],
): Map<string, AvailableChartColorsKeys> => {
  const categoryColors = new Map<string, AvailableChartColorsKeys>();
  categories.forEach((category, index) => {
    categoryColors.set(category, colors[index % colors.length]);
  });
  return categoryColors;
};

export const getColorClassName = (color: AvailableChartColorsKeys, type: ColorUtility): string => {
  const fallbackColor = {
    bg: 'bg-muted',
    stroke: 'stroke-muted',
    fill: 'fill-muted',
    text: 'text-muted',
  };
  return chartColors[color]?.[type] ?? fallbackColor[type];
};

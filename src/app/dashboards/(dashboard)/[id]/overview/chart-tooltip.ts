import { labelSide, type LabelSide } from '@/lib/reporting/net-worth-chart';

/**
 * The plate a chart's figures sit on while a point or a pair is picked (docs/design-system.md,
 * "Charts"): solid `surface`, so its `ink` and `muted` figures read over any mark, hung from the
 * top of the plot at `left`.
 */
export const CHART_TOOLTIP_CLASS =
  'absolute top-0 z-10 rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-lg';

/**
 * Which side of its point the plate hangs on, so it never runs past the plot's edge: right of
 * it on the plot's left half, left of it on its right half.
 */
const TOOLTIP_SIDE_CLASS: Record<LabelSide, string> = {
  start: 'ml-2',
  center: 'ml-2',
  end: '-ml-2 -translate-x-full',
};

/** The side class for a plate hung at `x`, in % of the plot's width. */
export const tooltipSideClass = (x: number): string => TOOLTIP_SIDE_CLASS[labelSide(x)];

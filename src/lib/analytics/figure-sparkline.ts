import { sparkline } from '@/lib/reporting/net-worth-headline';
import { pathThrough, type PathOptions } from '@/lib/reporting/smooth-path';

/**
 * A Key figure's sparkline (spec #225, ticket #230), drawn as the Net worth headline's trend:
 * fitted between its own low and high in a 100 × 100 box, filled down to its foot. A partial
 * current interval is set apart: its last segment dashed, its point a hollow dot; so is a Period's
 * first interval cut short at its start (ADR-0016): its first segment dashed.
 */

export interface FigureSparklineInput {
  value: number;
  isPartial: boolean;
}

export interface FigureSparklineShape {
  /** The line through the settled intervals; empty when there are none. */
  solid: string;
  /** The segments into the partial intervals, first and last; null when none is partial. */
  partial: string | null;
  /** The whole line closed down to the box's bottom, to fill under it. */
  area: string;
  /** The latest point, where its dot sits. */
  last: { x: number; y: number; isPartial: boolean };
}

export type FigureSparklineOptions = PathOptions;

/** The sparkline's shape; null from fewer than two points, which draw no line. */
export function figureSparkline(
  points: readonly FigureSparklineInput[],
  { isSmooth = false }: FigureSparklineOptions = {},
): FigureSparklineShape | null {
  const shape = sparkline(points.map((point) => point.value));
  if (!shape) return null;
  const { spots } = shape;
  /** The path from spot `from` to spot `to`; empty when it holds no segment. */
  const pathOf = (from: number, to: number) => pathThrough(spots, from, to, { isSmooth });
  const lastIndex = spots.length - 1;
  const isFirstPartial = points[0]!.isPartial;
  const isPartial = points.at(-1)!.isPartial;
  const last = spots[lastIndex]!;
  // With two points only, the first segment and the last are the same one.
  const partials = [
    isFirstPartial ? pathOf(0, 1) : null,
    isPartial && !(isFirstPartial && spots.length === 2) ? pathOf(lastIndex - 1, lastIndex) : null,
  ].filter((path) => path !== null);
  return {
    solid: pathOf(isFirstPartial ? 1 : 0, isPartial ? lastIndex - 1 : lastIndex),
    partial: partials.length === 0 ? null : partials.join(' '),
    area: isSmooth ? `${pathOf(0, lastIndex)} L100,100 L0,100 Z` : shape.area,
    last: { ...last, isPartial },
  };
}

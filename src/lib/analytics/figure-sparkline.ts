import { sparkline } from '@/lib/reporting/net-worth-headline';

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

const pathOf = (spots: readonly { x: number; y: number }[]) =>
  spots.length === 0 ? '' : `M${spots.map((spot) => `${spot.x},${spot.y}`).join(' L')}`;

/** The sparkline's shape; null from fewer than two points, which draw no line. */
export function figureSparkline(
  points: readonly FigureSparklineInput[],
): FigureSparklineShape | null {
  const shape = sparkline(points.map((point) => point.value));
  if (!shape) return null;
  const { spots } = shape;
  const isFirstPartial = points[0]!.isPartial;
  const isPartial = points.at(-1)!.isPartial;
  const last = spots.at(-1)!;
  // With two points only, the first segment and the last are the same one.
  const segments = [
    isFirstPartial ? pathOf(spots.slice(0, 2)) : null,
    isPartial && !(isFirstPartial && spots.length === 2) ? pathOf(spots.slice(-2)) : null,
  ].filter((segment) => segment !== null);
  return {
    solid: pathOf(spots.slice(isFirstPartial ? 1 : 0, isPartial ? -1 : undefined)),
    partial: segments.length === 0 ? null : segments.join(' '),
    area: shape.area,
    last: { ...last, isPartial },
  };
}

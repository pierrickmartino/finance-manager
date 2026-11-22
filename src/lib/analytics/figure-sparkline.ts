import { sparkline } from '@/lib/reporting/net-worth-headline';

/**
 * A Key figure's sparkline (spec #225, ticket #230), drawn as the Net worth headline's trend:
 * fitted between its own low and high in a 100 × 100 box, filled down to its foot. A partial
 * current period (ADR-0015) is set apart: its last segment dashed, its point a hollow dot.
 */

export interface FigureSparklineInput {
  value: number;
  isPartial: boolean;
}

export interface FigureSparklineShape {
  /** The line through the settled periods. */
  solid: string;
  /** The last segment, into the partial period; null when none is partial. */
  partial: string | null;
  /** The whole line closed down to the box's bottom, to fill under it. */
  area: string;
  /** The latest point, where its dot sits. */
  last: { x: number; y: number; isPartial: boolean };
}

const pathOf = (spots: readonly { x: number; y: number }[]) =>
  `M${spots.map((spot) => `${spot.x},${spot.y}`).join(' L')}`;

/** The sparkline's shape; null from fewer than two points, which draw no line. */
export function figureSparkline(
  points: readonly FigureSparklineInput[],
): FigureSparklineShape | null {
  const shape = sparkline(points.map((point) => point.value));
  if (!shape) return null;
  const { spots } = shape;
  const isPartial = points.at(-1)!.isPartial;
  const last = spots.at(-1)!;
  return {
    solid: isPartial ? pathOf(spots.slice(0, -1)) : shape.line,
    partial: isPartial ? pathOf(spots.slice(-2)) : null,
    area: shape.area,
    last: { ...last, isPartial },
  };
}

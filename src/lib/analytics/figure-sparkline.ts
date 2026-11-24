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

export interface FigureSparklineOptions {
  /** Curve through the points instead of joining them with straight segments. */
  isSmooth?: boolean;
}

interface Spot {
  x: number;
  y: number;
}

const at = (spot: Spot) => `${spot.x},${spot.y}`;
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Each point's slope for a monotone curve (Steffen's method): flat at a peak or a trough, and
 * never steeper than keeps each curve between its two points, so the line never overshoots.
 */
function slopesOf(spots: readonly Spot[]): number[] {
  const deltas = spots.slice(1).map((spot, i) => (spot.y - spots[i]!.y) / (spot.x - spots[i]!.x));
  const inner = deltas.slice(1).map((after, i) => {
    const before = deltas[i]!;
    const limit = Math.min(Math.abs(before), Math.abs(after), Math.abs(before + after) / 4);
    return (Math.sign(before) + Math.sign(after)) * limit;
  });
  // The ends: the slope a parabola through the end and its neighbour's slope would take.
  const end = (delta: number, neighbour: number | undefined) =>
    neighbour === undefined ? delta : (3 * delta - neighbour) / 2;
  return [end(deltas[0]!, inner[0]), ...inner, end(deltas.at(-1)!, inner.at(-1))];
}

/** How to draw segment `i`, from spot `i` to the next, after a path has reached spot `i`. */
type Segment = (i: number) => string;

const straight =
  (spots: readonly Spot[]): Segment =>
  (i) =>
    ` L${at(spots[i + 1]!)}`;

const curved = (spots: readonly Spot[]): Segment => {
  const slopes = slopesOf(spots);
  return (i) => {
    const from = spots[i]!;
    const to = spots[i + 1]!;
    const third = (to.x - from.x) / 3;
    const start = { x: round(from.x + third), y: round(from.y + slopes[i]! * third) };
    const end = { x: round(to.x - third), y: round(to.y - slopes[i + 1]! * third) };
    return ` C${at(start)} ${at(end)} ${at(to)}`;
  };
};

/** The sparkline's shape; null from fewer than two points, which draw no line. */
export function figureSparkline(
  points: readonly FigureSparklineInput[],
  { isSmooth = false }: FigureSparklineOptions = {},
): FigureSparklineShape | null {
  const shape = sparkline(points.map((point) => point.value));
  if (!shape) return null;
  const { spots } = shape;
  const segment = (isSmooth ? curved : straight)(spots);
  /** The path from spot `from` to spot `to`; empty when it holds no segment. */
  const pathOf = (from: number, to: number) => {
    if (to <= from) return '';
    const segments = Array.from({ length: to - from }, (_, i) => segment(from + i));
    return `M${at(spots[from]!)}${segments.join('')}`;
  };
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

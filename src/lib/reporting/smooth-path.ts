/**
 * An SVG path through a run of spots (docs/design-system.md, "Charts"), straight or as a smooth
 * monotone curve: the Key figures' sparklines and a line flow's areas and lines. The curve uses
 * Steffen's method, so it is flat at a peak, a trough or a level stretch and never overshoots
 * the spots it passes through, however unevenly they are spaced: a running total never seems to
 * dip, and a line never strays above its highest point.
 */

export interface Spot {
  x: number;
  y: number;
}

export interface PathOptions {
  /** Curve through the spots instead of joining them with straight segments. */
  isSmooth?: boolean;
}

const at = (spot: Spot) => `${spot.x},${spot.y}`;
const round = (value: number) => Math.round(value * 100) / 100;
const slopeOf = (from: Spot, to: Spot) => (to.y - from.y) / (to.x - from.x);

/** Each spot's slope, by Steffen's method. */
function slopesOf(spots: readonly Spot[]): number[] {
  const widths = spots.slice(1).map((spot, i) => spot.x - spots[i]!.x);
  const deltas = spots.slice(1).map((spot, i) => slopeOf(spots[i]!, spot));
  const inner = deltas.slice(1).map((after, i) => {
    const before = deltas[i]!;
    // The slope of the parabola through this spot and its two neighbours.
    const parabola = (before * widths[i + 1]! + after * widths[i]!) / (widths[i]! + widths[i + 1]!);
    const limit = Math.min(Math.abs(before), Math.abs(after), Math.abs(parabola) / 2);
    return (Math.sign(before) + Math.sign(after)) * limit;
  });
  // The ends: the slope a parabola through the end and its neighbour's slope would take.
  const end = (delta: number, neighbour: number | undefined) =>
    neighbour === undefined ? delta : (3 * delta - neighbour) / 2;
  return [end(deltas[0]!, inner[0]), ...inner, end(deltas.at(-1)!, inner.at(-1))];
}

/** Segment `i`, from spot `i` to the next, once a path has reached spot `i`. */
type Segment = (i: number) => string;

const straight =
  (spots: readonly Spot[]): Segment =>
  (i) =>
    ` L${at(spots[i + 1]!)}`;

function curved(spots: readonly Spot[]): Segment {
  const slopes = slopesOf(spots);
  return (i) => {
    const from = spots[i]!;
    const to = spots[i + 1]!;
    const third = (to.x - from.x) / 3;
    const start = { x: round(from.x + third), y: round(from.y + slopes[i]! * third) };
    const end = { x: round(to.x - third), y: round(to.y - slopes[i + 1]! * third) };
    return ` C${at(start)} ${at(end)} ${at(to)}`;
  };
}

/**
 * The path from spot `from` to spot `to` (indexes into `spots`), straight or curved; empty when
 * it holds no segment. A stretch is drawn as part of the curve through all the spots, so
 * stretches drawn apart (a solid run, then a dashed one) meet without a kink.
 */
export function pathThrough(
  spots: readonly Spot[],
  from: number,
  to: number,
  { isSmooth = false }: PathOptions = {},
): string {
  if (to <= from) return '';
  const segment = (isSmooth ? curved : straight)(spots);
  const segments = Array.from({ length: to - from }, (_, i) => segment(from + i));
  return `M${at(spots[from]!)}${segments.join('')}`;
}

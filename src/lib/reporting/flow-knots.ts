/**
 * Which points of a line flow its curve passes through (docs/design-system.md, "Charts"). By
 * day a flow is a running total, a staircase that a curve through every day would only follow
 * step by step, so it curves through a day every so often instead, counted back from the last
 * point so the curve ends on it: a week apart over a short flow, about a month apart over a
 * year (some 13 knots), so a monthly salary rises as a slope rather than a step. The first and last points, and both ends of every partial segment
 * (drawn dashed), are always kept, so the dashed stretches start and end on a knot. By any
 * other Interval every point is a knot. Only the drawing thins: every day keeps its hover
 * figures and its dots.
 */

/** The fewest days between two knots of a flow by day: a week. */
const KNOT_DAYS = 7;
/** About how many knots a long flow by day keeps: a month apart over a year. */
const KNOTS = 13;
/** A flow is by day while its keys are dates. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

interface KnotPoint {
  key: string | null;
  isPartial: boolean;
}

/** The indexes of the points the curve passes through, in order. */
export function flowKnots(points: readonly KnotPoint[]): number[] {
  const last = points.length - 1;
  const gap = Math.max(KNOT_DAYS, Math.ceil(points.length / KNOTS));
  const isByDay = points.length > KNOT_DAYS + 1 && points.every((p) => DAY_KEY.test(p.key ?? ''));
  return points.flatMap((point, i) => {
    const isEnd = i === 0 || i === last;
    const isSpaced = (last - i) % gap === 0;
    // A partial point's neighbours, where its dashed segment starts or ends.
    const isNextToPartial = Boolean(points[i - 1]?.isPartial || points[i + 1]?.isPartial);
    return !isByDay || isEnd || isSpaced || point.isPartial || isNextToPartial ? [i] : [];
  });
}

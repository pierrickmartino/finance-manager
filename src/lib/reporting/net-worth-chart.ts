import type { NetWorthBand } from './net-worth-card';
import type { PeriodValue } from './period-values';

/**
 * The Net worth card's geometry: where its bands, line and markers sit in a 100 × 100 box (in
 * percent: x across, y down from the top), drawn by `overview/net-worth-mark.tsx`.
 */

/** Where a band sits at one point: from `low` to `high`, in money. */
export interface Span {
  low: number;
  high: number;
}

/** Maps money and point index into the box. */
export interface Scale {
  x: (index: number) => number;
  y: (value: number) => number;
}

/** A spot in the box. */
export interface Spot {
  x: number;
  y: number;
}

interface Stack {
  spans: Span[][];
  /** The top of the positive bands so far at each point, and the bottom of the negative ones. */
  above: number[];
  below: number[];
}

/** Each band's span per point, in band order: positive values stack up from zero, negative ones down. */
export function stackBands(bands: readonly NetWorthBand[]): Span[][] {
  const zeros = (bands[0]?.points ?? []).map(() => 0);
  const empty: Stack = { spans: [], above: zeros, below: zeros };
  return bands.reduce<Stack>((stack, band) => {
    const values = band.points.map((point) => point.value);
    const spans = values.map((value, i) => {
      const base = value >= 0 ? stack.above[i]! : stack.below[i]!;
      return { low: Math.min(base, base + value), high: Math.max(base, base + value) };
    });
    return {
      spans: [...stack.spans, spans],
      above: stack.above.map((top, i) => top + Math.max(0, values[i] ?? 0)),
      below: stack.below.map((bottom, i) => bottom + Math.min(0, values[i] ?? 0)),
    };
  }, empty).spans;
}

/** The scale fitting `count` points and every value (and zero) into the box. */
export function scaleOf(count: number, values: readonly number[]): Scale {
  const low = Math.min(0, ...values);
  const span = Math.max(0, ...values) - low || 1;
  return {
    x: (i) => (count > 1 ? (i * 100) / (count - 1) : 50),
    y: (value) => 100 - ((value - low) / span) * 100,
  };
}

/** A band's outline: along its top edge, then back along its bottom; a stepped band steps. */
export function bandPath(spans: readonly Span[], isStepped: boolean, scale: Scale): string {
  const edge = (pick: (span: Span) => number) =>
    spans.flatMap((span, i) => {
      const at = `${scale.x(i)},${scale.y(pick(span))}`;
      return isStepped && i > 0 ? [`${scale.x(i)},${scale.y(pick(spans[i - 1]!))}`, at] : [at];
    });
  const top = edge((span) => span.high);
  const bottom = edge((span) => span.low).reverse();
  return `M${[...top, ...bottom].join(' L')} Z`;
}

/** Which side of its point a value label hangs from, so it stays inside the plot's width. */
export type LabelSide = 'start' | 'center' | 'end';

/**
 * A label past the middle ends at its point, one before it starts there, and one in the
 * middle (a lone point) is centred on it.
 */
export function labelSide(x: number): LabelSide {
  if (x > 50) return 'end';
  return x < 50 ? 'start' : 'center';
}

/** Where a marker `at` points along the line sits: between the two points either side of it. */
export function alongLine(points: readonly PeriodValue[], at: number, scale: Scale): Spot {
  const before = Math.min(Math.floor(at), points.length - 1);
  const after = Math.min(before + 1, points.length - 1);
  const through = at - before;
  const value = points[before]!.value + (points[after]!.value - points[before]!.value) * through;
  return { x: scale.x(before) + (scale.x(after) - scale.x(before)) * through, y: scale.y(value) };
}

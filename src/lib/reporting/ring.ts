import { OTHER_LABEL, type ChartSource } from './chart-data';
import { shareParts } from './story';

/**
 * The ring a Donut Widget's card draws (ADR-0009): its parts as slices, largest first and
 * clockwise from the top, each a tone of the hero's navy, darkest first; "Other" comes last in
 * a neutral grey. Sized by magnitude, labelled with the signed value.
 */

/** How many navy tones the ramp has: one per named part (seven plus "Other", see MAX_SERIES). */
export const RING_TONES = 7;

export interface RingSlice {
  label: string;
  /** Signed, in minor units: a refund in an expense breakdown stays negative. */
  value: number;
  /** Of the whole, by magnitude (0–1). */
  share: number;
  href: string | null;
  isOther: boolean;
  /** Its sign goes against the whole's: a refund among expenses, a fee among income. */
  isCounter: boolean;
  /** Its place on the navy ramp, 0 darkest; unused for "Other". */
  tone: number;
  /** Radians, clockwise from the top. */
  start: number;
  end: number;
}

const TURN = Math.PI * 2;

export function ringSlices(data: ChartSource): RingSlice[] {
  const all = shareParts(data);
  const ordered = [
    ...all.filter((part) => part.label !== OTHER_LABEL),
    ...all.filter((part) => part.label === OTHER_LABEL),
  ];
  const wholeSign = Math.sign(data.total ?? ordered.reduce((sum, part) => sum + part.value, 0));
  const starts = ordered.map((_, i) =>
    ordered.slice(0, i).reduce((angle, part) => angle + part.share * TURN, 0),
  );
  return ordered.map((part, i) => ({
    ...part,
    isOther: part.label === OTHER_LABEL,
    isCounter: wholeSign !== 0 && Math.sign(part.value) === -wholeSign,
    tone: Math.min(i, RING_TONES - 1),
    start: starts[i]!,
    end: starts[i]! + part.share * TURN,
  }));
}

export interface RingGeometry {
  /** The square the ring sits in, in SVG units. */
  size: number;
  outer: number;
  inner: number;
}

/**
 * One slice as a closed SVG path: along the outer edge, in to the inner edge, and back. The
 * numbers print with two decimals, so the path the server renders is the one the browser
 * hydrates (their trigonometry can differ in the last digits).
 */
export function ringArcPath(start: number, end: number, ring: RingGeometry): string {
  const centre = ring.size / 2;
  const point = (radius: number, angle: number) =>
    `${(centre + radius * Math.sin(angle)).toFixed(2)},${(centre - radius * Math.cos(angle)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M${point(ring.outer, start)}`,
    `A${ring.outer},${ring.outer} 0 ${large} 1 ${point(ring.outer, end)}`,
    `L${point(ring.inner, end)}`,
    `A${ring.inner},${ring.inner} 0 ${large} 0 ${point(ring.inner, start)}`,
    'Z',
  ].join(' ');
}

import { RAMP_FILLS } from '@/lib/color/ramp-fills';
import { RampGradient, url, useRampGradientIds } from './ramp-gradient';

/**
 * The sparkline's drawing (docs/design-system.md, "Charts"), shared by the Net worth headline
 * and the Key figures: a flat `ramp-1` line over the ramp's gradient (cyan at the line, violet at
 * its foot: `RAMP_FILLS.sparkline`, fills only) in a 100 × 100 box that
 * stretches to its container, and the latest point's dot, hollow while its period runs. Paths
 * come from `sparkline` (src/lib/reporting/net-worth-headline.ts). Neither part is read by
 * assistive technology: whoever draws them says the values as text.
 */

const STROKE = {
  fill: 'none',
  className: 'stroke-ramp-1',
  strokeWidth: 1.75,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const;

interface SparklineSvgProps {
  /** The line, closed down to the box's bottom. */
  area: string;
  /** The line through the settled points. */
  line: string;
  /** The last segment, into a partial period, drawn dashed; none when nothing is partial. */
  partial?: string | null;
}

/** The fill and the line, filling its positioned container. */
export function SparklineSvg({ area, line, partial }: SparklineSvgProps) {
  const fill = useRampGradientIds()('area');
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <RampGradient id={fill} fill={RAMP_FILLS.sparkline} />
      </defs>
      <path d={area} fill={url(fill)} />
      <path d={line} {...STROKE} />
      {partial && <path d={partial} {...STROKE} strokeDasharray="3 3" />}
    </svg>
  );
}

interface SparklineDotProps {
  /** Where the latest point sits, in percent of the box. */
  x: number;
  y: number;
  /** Its period is still running: the dot is hollow. */
  isPartial: boolean;
}

/** The latest point's dot. */
export function SparklineDot({ x, y, isPartial }: SparklineDotProps) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ramp-1 ${isPartial ? 'bg-surface' : 'bg-ramp-1'}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    />
  );
}

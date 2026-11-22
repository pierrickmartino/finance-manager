import { figureSparkline, type FigureSparklineInput } from '@/lib/analytics/figure-sparkline';

interface FigureSparklineMarkProps {
  points: readonly FigureSparklineInput[];
}

/**
 * A Key figure's sparkline, drawn as the overview's headline trend: a `hero-deep` line filled
 * flat in `hero-mist`, scaled to its own low and high. A partial current period is a dashed
 * last segment to a hollow dot (ADR-0015). Hidden from assistive technology: the tile says
 * every value it carries as text.
 */
export function FigureSparklineMark({ points }: FigureSparklineMarkProps) {
  const shape = figureSparkline(points);
  if (!shape) return null;
  const stroke = {
    fill: 'none',
    className: 'stroke-hero-deep',
    strokeWidth: 1.75,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    vectorEffect: 'non-scaling-stroke',
  } as const;
  return (
    // At the tile's foot, so the sparklines of a row line up whatever stands above them.
    <div aria-hidden data-sparkline className="mt-auto pt-3">
      <div className="relative mr-1.5 h-10 min-w-0">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <path d={shape.area} className="fill-hero-mist" fillOpacity={0.4} />
          <path d={shape.solid} {...stroke} />
          {shape.partial && <path d={shape.partial} {...stroke} strokeDasharray="3 3" />}
        </svg>
        <span
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hero-deep ${shape.last.isPartial ? 'bg-surface' : 'bg-hero-deep'}`}
          style={{ left: `${shape.last.x}%`, top: `${shape.last.y}%` }}
        />
      </div>
    </div>
  );
}

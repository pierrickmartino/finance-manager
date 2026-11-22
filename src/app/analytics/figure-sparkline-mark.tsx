import { SparklineDot, SparklineSvg } from '@/components/sparkline-mark';
import { figureSparkline, type FigureSparklineInput } from '@/lib/analytics/figure-sparkline';

interface FigureSparklineMarkProps {
  points: readonly FigureSparklineInput[];
}

/**
 * A Key figure's sparkline, drawn as the overview's headline trend and scaled to its own low
 * and high. A partial current period is a dashed last segment to a hollow dot, and a Span's
 * first period cut short a dashed first segment (ADR-0016).
 * Hidden from assistive technology: the tile says every value it carries as text.
 */
export function FigureSparklineMark({ points }: FigureSparklineMarkProps) {
  const shape = figureSparkline(points);
  if (!shape) return null;
  return (
    // At the tile's foot, so the sparklines of a row line up whatever stands above them.
    <div aria-hidden data-sparkline className="mt-auto pt-3">
      <div className="relative mr-1.5 h-10 min-w-0">
        <SparklineSvg area={shape.area} line={shape.solid} partial={shape.partial} />
        <SparklineDot {...shape.last} />
      </div>
    </div>
  );
}

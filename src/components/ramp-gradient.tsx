import { useId } from 'react';
import type { RampFill } from '@/lib/color/ramp-fills';

/**
 * A ramp gradient for an SVG mark's fill (src/lib/color/ramp-fills.ts): fills only, never a
 * stroke. Each drawing defines its own, so two marks on a page never share an id.
 */

const VECTOR: Record<RampFill['direction'], { x1: number; y1: number; x2: number; y2: number }> = {
  down: { x1: 0, y1: 0, x2: 0, y2: 1 },
  up: { x1: 0, y1: 1, x2: 0, y2: 0 },
  'down-right': { x1: 0, y1: 0, x2: 1, y2: 1 },
};

/** The `<linearGradient>` itself, to place inside the SVG's `<defs>`. */
export function RampGradient({ id, fill }: { id: string; fill: RampFill }) {
  return (
    <linearGradient id={id} {...VECTOR[fill.direction]}>
      {fill.stops.map(({ token, alpha, at }) => (
        <stop
          key={`${token}-${at}`}
          offset={at}
          style={{ stopColor: `var(--color-${token})`, stopOpacity: alpha }}
        />
      ))}
    </linearGradient>
  );
}

/** This drawing's gradient ids: `idOf(name)` to define one, `url(idOf(name))` to fill with it. */
export function useRampGradientIds(): (name: string) => string {
  const base = `ramp${useId().replace(/[^\w-]/g, '')}`;
  return (name) => `${base}-${name}`;
}

export const url = (id: string): string => `url(#${id})`;

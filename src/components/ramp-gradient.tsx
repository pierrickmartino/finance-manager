import { useId } from 'react';
import { RAMP_DIRECTIONS, type RampFill } from '@/lib/color/ramp-fills';

/**
 * A ramp gradient for an SVG mark's fill (src/lib/color/ramp-fills.ts): fills only, never a
 * stroke. Each drawing defines its own, so two marks on a page never share an id.
 */

/** The `<linearGradient>` itself, to place inside the SVG's `<defs>`. */
export function RampGradient({ id, fill }: { id: string; fill: RampFill }) {
  return (
    <linearGradient id={id} {...RAMP_DIRECTIONS[fill.direction].vector}>
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

/**
 * This drawing's gradient ids: `idOf(name)` to define one, `gradientFill(idOf(name))` to fill
 * with it.
 */
export function useRampGradientIds(): (name: string) => string {
  const base = `ramp${useId().replace(/[^\w-]/g, '')}`;
  return (name) => `${base}-${name}`;
}

/** The `fill` that paints a mark with the gradient of this id. */
export const gradientFill = (id: string): string => `url(#${id})`;

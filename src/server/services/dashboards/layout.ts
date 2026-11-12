import { z } from 'zod';
import { GRID_COLUMNS, MAX_WIDGET_HEIGHT } from '@/lib/reporting/board';
import type { WidgetLayout } from '../reporting';

/** The bounds a stored layout is checked against: the board's (ADR-0010). */
export { GRID_COLUMNS, MAX_WIDGET_HEIGHT };
const MAX_ROW = 10_000;

/** The size stored with a new Widget. */
export const DEFAULT_WIDGET_SIZE = { w: 6, h: 8 } as const;

export const widgetLayoutInput = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(MAX_ROW),
    w: z.number().int().min(1).max(GRID_COLUMNS),
    h: z.number().int().min(1).max(MAX_WIDGET_HEIGHT),
  })
  .strict()
  .refine((layout) => layout.x + layout.w <= GRID_COLUMNS, {
    message: `A Widget must fit in the ${GRID_COLUMNS} grid columns`,
  });

/**
 * The Dashboard Story is one column (ADR-0007): a Widget's place is its `y`, counted from 0,
 * at `x` 0. Its `w` and `h` are kept as they are, though nothing reads them any more.
 */
export function storyLayout(
  index: number,
  size: { w: number; h: number } = DEFAULT_WIDGET_SIZE,
): WidgetLayout {
  return { x: 0, y: index, w: size.w, h: size.h };
}

/** `items` with `item` inserted at `position` (clamped), or at the end without one. */
export function insertAt<T>(items: readonly T[], item: T, position?: number): T[] {
  const at = position === undefined ? items.length : Math.min(Math.max(position, 0), items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

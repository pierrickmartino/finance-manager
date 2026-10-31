import { z } from 'zod';
import type { WidgetLayout } from '../reporting';

/** The Dashboard grid: 12 columns; heights in rows. */
export const GRID_COLUMNS = 12;
export const MAX_WIDGET_HEIGHT = 40;
const MAX_ROW = 10_000;

/** Where a new Widget lands when nothing says otherwise: half width, a medium height. */
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

/** The first free row under every placed Widget. */
export function bottomRow(layouts: ReadonlyArray<WidgetLayout | null>): number {
  return layouts.reduce(
    (bottom, layout) => (layout ? Math.max(bottom, layout.y + layout.h) : bottom),
    0,
  );
}

/** A Widget of `size` placed at the left, below every other Widget. */
export function placeAtBottom(
  layouts: ReadonlyArray<WidgetLayout | null>,
  size: { w: number; h: number } = DEFAULT_WIDGET_SIZE,
  x = 0,
): WidgetLayout {
  return { x, y: bottomRow(layouts), w: size.w, h: size.h };
}

import { z } from 'zod';
import {
  firstFreeSpot,
  GRID_COLUMNS,
  MAX_BOARD_ROWS,
  MAX_WIDGET_HEIGHT,
  type Cell,
  type Size,
} from '@/lib/reporting/board';
import type { WidgetLayout } from '../reporting/widgets';

/** A stored layout is checked against the board's bounds (ADR-0010). */
const layoutShape = {
  x: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLUMNS - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(MAX_BOARD_ROWS - 1),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  h: z.number().int().min(1).max(MAX_WIDGET_HEIGHT),
};
const FITS_COLUMNS = {
  message: `A Widget must fit in the ${GRID_COLUMNS} grid columns`,
};
const FITS_ROWS = {
  message: `A Widget must fit in the board's ${MAX_BOARD_ROWS} rows`,
};
const fitsColumns = (layout: WidgetLayout): boolean => layout.x + layout.w <= GRID_COLUMNS;
const fitsRows = (layout: WidgetLayout): boolean => layout.y + layout.h <= MAX_BOARD_ROWS;

export const widgetLayoutInput = z
  .object(layoutShape)
  .strict()
  .refine(fitsColumns, FITS_COLUMNS)
  .refine(fitsRows, FITS_ROWS);

/** A whole board as the editor saves it: every Widget's card. */
export const boardInput = z.array(
  z
    .object({ id: z.uuid({ error: 'Unknown Widget' }), ...layoutShape })
    .strict()
    .refine(fitsColumns, FITS_COLUMNS)
    .refine(fitsRows, FITS_ROWS),
);
export type CellInput = z.input<typeof boardInput>[number];

/**
 * A layout of `size` in the first free spot of the board `cells`: at the bottom, or next to
 * or below the card `nextTo` (ADR-0010).
 */
export function freeLayout(cells: readonly Cell[], size: Size, nextTo?: string): WidgetLayout {
  return { ...firstFreeSpot(cells, size, nextTo), w: size.w, h: size.h };
}

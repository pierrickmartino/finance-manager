import { z } from 'zod';
import {
  defaultSize,
  firstFreeSpot,
  GRID_COLUMNS,
  MAX_WIDGET_HEIGHT,
  type Cell,
  type Size,
} from '@/lib/reporting/board';
import type { ServiceContext } from '../context';
import { chapterSourceOf, type Widget, type WidgetLayout } from '../reporting/widgets';

export { chapterSourceOf };

/** The bounds a stored layout is checked against: the board's (ADR-0010). */
export { GRID_COLUMNS, MAX_WIDGET_HEIGHT };
const MAX_ROW = 10_000;

const layoutShape = {
  x: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLUMNS - 1),
  y: z.number().int().min(0).max(MAX_ROW),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  h: z.number().int().min(1).max(MAX_WIDGET_HEIGHT),
};
const FITS_COLUMNS = {
  message: `A Widget must fit in the ${GRID_COLUMNS} grid columns`,
};
const fitsColumns = (layout: WidgetLayout): boolean => layout.x + layout.w <= GRID_COLUMNS;

export const widgetLayoutInput = z.object(layoutShape).strict().refine(fitsColumns, FITS_COLUMNS);

/** A whole board as the editor saves it: every Widget's card. */
export const boardInput = z.array(
  z
    .object({ id: z.uuid({ error: 'Unknown Widget' }), ...layoutShape })
    .strict()
    .refine(fitsColumns, FITS_COLUMNS),
);
export type CellInput = z.input<typeof boardInput>[number];

/** The cards of a Dashboard's Widgets on its board (a Widget without a layout has none). */
export function boardCells(widgets: readonly Widget[]): Cell[] {
  return widgets.flatMap((widget) => (widget.layout ? [{ id: widget.id, ...widget.layout }] : []));
}

/** A layout's size alone. */
export function sizeOf(layout: WidgetLayout): Size {
  return { w: layout.w, h: layout.h };
}

/** The size a new Widget starts at on a board: its chapter kind's default. */
export async function initialSize(
  ctx: ServiceContext,
  widget: Pick<Widget, 'source' | 'query' | 'visualisation'>,
): Promise<Size> {
  return defaultSize(await chapterSourceOf(ctx, widget));
}

/**
 * A layout of `size` in the first free spot of the board `cells`: at the bottom, or next to
 * or below the card `nextTo` (ADR-0010).
 */
export function freeLayout(cells: readonly Cell[], size: Size, nextTo?: string): WidgetLayout {
  return { ...firstFreeSpot(cells, size, nextTo), w: size.w, h: size.h };
}

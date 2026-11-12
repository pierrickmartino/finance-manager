import { z } from 'zod';
import {
  defaultSize,
  firstFreeSpot,
  GRID_COLUMNS,
  MAX_WIDGET_HEIGHT,
  type Cell,
  type Size,
} from '@/lib/reporting/board';
import type { ChapterSource } from '@/lib/reporting/story';
import type { ServiceContext } from '../context';
import { ServiceError } from '../errors';
import { runSavedWidget, type Widget, type WidgetLayout } from '../reporting/widgets';

/** The bounds a stored layout is checked against: the board's (ADR-0010). */
export { GRID_COLUMNS, MAX_WIDGET_HEIGHT };
const MAX_ROW = 10_000;

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

/** The cards of a Dashboard's Widgets on its board (a Widget without a layout has none). */
export function boardCells(widgets: readonly Widget[]): Cell[] {
  return widgets.flatMap((widget) => (widget.layout ? [{ id: widget.id, ...widget.layout }] : []));
}

/**
 * What decides a Widget's chapter kind, as the Dashboard Story reads it. Only a stacked bar
 * depends on its data (how many series it has), so only a stacked bar's query is run; one that
 * fails to run counts as having no series.
 */
export async function chapterSourceOf(
  ctx: ServiceContext,
  widget: Pick<Widget, 'source' | 'query' | 'visualisation'>,
): Promise<ChapterSource> {
  const { source, visualisation } = widget;
  if (source !== 'query' || visualisation !== 'stacked_bar') {
    return { source, visualisation, data: null };
  }
  try {
    const report = await runSavedWidget(ctx, widget);
    return { source, visualisation, data: { columns: report.columns } };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { source, visualisation, data: null };
    throw error;
  }
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

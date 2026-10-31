import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { mutate, type ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import type { HistorySnapshot, JsonValue } from '../history';
import { runWidgetQuery, type ReportTable } from './engine';
import { widgetQueryInput, type WidgetQuery } from './query';

/** The five ways to show a Widget (spec 104). The table is also the full-screen pivot. */
export const VISUALISATIONS = ['table', 'line', 'stacked_bar', 'donut', 'number'] as const;
export type Visualisation = (typeof VISUALISATIONS)[number];

export const VISUALISATION_LABELS: Record<Visualisation, string> = {
  table: 'Table',
  line: 'Line',
  stacked_bar: 'Stacked bar',
  donut: 'Donut',
  number: 'Single number',
};

/** A saved Widget query with its visualisation (GLOSSARY: Widget). */
export interface Widget {
  id: string;
  name: string;
  /** The query with every default filled in. */
  query: WidgetQuery;
  visualisation: Visualisation;
  /** Position and size on a Dashboard grid (owned by Dashboards); null until placed. */
  layout: JsonValue | null;
  createdAt: Date;
}

const MAX_NAME_LENGTH = 100;

export const widgetInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Widget name is required')
    .max(MAX_NAME_LENGTH, `Widget name must be at most ${MAX_NAME_LENGTH} characters`),
  query: widgetQueryInput,
  visualisation: z.enum(VISUALISATIONS, { error: 'Unknown visualisation' }).default('table'),
});
export type WidgetInput = z.input<typeof widgetInput>;

const SELECT_WIDGET = `
  SELECT w.id, w.name, w.query, w.visualisation, w.layout, w.created_at AS "createdAt"
  FROM widget w`;

const WIDGET_NOT_FOUND = 'Widget not found';
const uuid = z.uuid();

/**
 * A stored query read back through the schema, so it has today's defaults and the same key
 * order as a freshly validated one (History compares them as JSON).
 */
function readWidget(row: Widget): Widget {
  const parsed = widgetQueryInput.safeParse(row.query);
  return { ...row, query: parsed.success ? parsed.data : row.query };
}

export async function findWidget(db: Queryable, id: string, lock = false): Promise<Widget> {
  if (!uuid.safeParse(id).success) throw new NotFoundError(WIDGET_NOT_FOUND);
  const result = await db.query<Widget>(
    `${SELECT_WIDGET} WHERE w.id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError(WIDGET_NOT_FOUND);
  return readWidget(row);
}

/** What History tracks of a Widget. The layout is left out: moving Widgets isn't History. */
export function widgetSnapshot(widget: Widget): HistorySnapshot {
  return {
    name: widget.name,
    query: widget.query as unknown as JsonValue,
    visualisation: widget.visualisation,
  };
}

export async function createWidget(ctx: ServiceContext, input: WidgetInput): Promise<Widget> {
  const values = parseInput(widgetInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const result = await tx.query<{ id: string }>(
      `INSERT INTO widget (name, query, visualisation) VALUES ($1, $2, $3) RETURNING id`,
      [values.name, JSON.stringify(values.query), values.visualisation],
    );
    const widget = await findWidget(tx, result.rows[0]!.id);
    await history.record('widget', widget.id, null, widgetSnapshot(widget));
    return widget;
  });
}

/** Replaces a Widget's name, query and visualisation. */
export async function updateWidget(
  ctx: ServiceContext,
  id: string,
  input: WidgetInput,
): Promise<Widget> {
  const values = parseInput(widgetInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findWidget(tx, id, true);
    await tx.query(`UPDATE widget SET name = $2, query = $3, visualisation = $4 WHERE id = $1`, [
      id,
      values.name,
      JSON.stringify(values.query),
      values.visualisation,
    ]);
    const after = await findWidget(tx, id);
    await history.record('widget', id, widgetSnapshot(before), widgetSnapshot(after));
    return after;
  });
}

export async function deleteWidget(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }) => {
    const before = await findWidget(tx, id, true);
    await tx.query('DELETE FROM widget WHERE id = $1', [id]);
    await history.record('widget', id, widgetSnapshot(before), null);
  });
}

export async function getWidget(ctx: ServiceContext, id: string): Promise<Widget> {
  return findWidget(ctx.db, id);
}

/** Every Widget, by name. */
export async function listWidgets(ctx: ServiceContext): Promise<Widget[]> {
  const result = await ctx.db.query<Widget>(`${SELECT_WIDGET} ORDER BY lower(w.name), w.id`);
  return result.rows.map(readWidget);
}

/** Runs a saved Widget's query. */
export async function runWidget(ctx: ServiceContext, id: string): Promise<ReportTable> {
  const widget = await getWidget(ctx, id);
  return runWidgetQuery(ctx, widget.query);
}

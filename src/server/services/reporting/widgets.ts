import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import type { HistorySnapshot, JsonValue } from '../history';
import { runAccountBalances } from './balances';
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

/**
 * What a Widget shows: its Widget query, or the Account balances in CHF today (a stock, not a
 * flow, so not an engine query; its stored query is ignored).
 */
export const WIDGET_SOURCES = ['query', 'account_balances'] as const;
export type WidgetSource = (typeof WIDGET_SOURCES)[number];

/** Position and size on a Dashboard's 12-column grid, in grid units. */
export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A saved Widget query with its visualisation (GLOSSARY: Widget). */
export interface Widget {
  id: string;
  name: string;
  /** The Dashboard it sits on; null for a standalone Widget (Reports page). */
  dashboardId: string | null;
  source: WidgetSource;
  /** The query with every default filled in. */
  query: WidgetQuery;
  visualisation: Visualisation;
  /** Position and size on its Dashboard's grid; null until placed. */
  layout: WidgetLayout | null;
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
  SELECT w.id, w.name, w.dashboard_id AS "dashboardId", w.source, w.query, w.visualisation,
         w.layout, w.created_at AS "createdAt"
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

/** Every Widget on a Dashboard, top to bottom, left to right. */
export async function findDashboardWidgets(db: Queryable, dashboardId: string): Promise<Widget[]> {
  const result = await db.query<Widget>(
    `${SELECT_WIDGET} WHERE w.dashboard_id = $1
     ORDER BY (w.layout->>'y')::int NULLS LAST, (w.layout->>'x')::int, w.created_at, w.id`,
    [dashboardId],
  );
  return result.rows.map(readWidget);
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

/**
 * What History tracks of a Widget. The layout is left out: moving and resizing Widgets isn't
 * History (spec 117).
 */
export function widgetSnapshot(widget: Widget): HistorySnapshot {
  return {
    name: widget.name,
    dashboardId: widget.dashboardId,
    source: widget.source === 'query' ? undefined : widget.source,
    query: widget.source === 'query' ? (widget.query as unknown as JsonValue) : undefined,
    visualisation: widget.visualisation,
  };
}

/** A Widget row to insert, already validated. */
export interface NewWidget {
  name: string;
  query: WidgetQuery;
  visualisation: Visualisation;
  dashboardId?: string | null;
  source?: WidgetSource;
  layout?: WidgetLayout | null;
}

/** Inserts a Widget inside an open mutation and records its creation. */
export async function insertWidget(scope: MutationScope, values: NewWidget): Promise<Widget> {
  const result = await scope.tx.query<{ id: string }>(
    `INSERT INTO widget (name, query, visualisation, dashboard_id, source, layout)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      values.name,
      JSON.stringify(values.query),
      values.visualisation,
      values.dashboardId ?? null,
      values.source ?? 'query',
      values.layout ? JSON.stringify(values.layout) : null,
    ],
  );
  const widget = await findWidget(scope.tx, result.rows[0]!.id);
  await scope.history.record('widget', widget.id, null, widgetSnapshot(widget));
  return widget;
}

/** Deletes a Widget inside an open mutation and records its deletion. */
export async function removeWidget(scope: MutationScope, id: string): Promise<void> {
  const before = await findWidget(scope.tx, id, true);
  await scope.tx.query('DELETE FROM widget WHERE id = $1', [id]);
  await scope.history.record('widget', id, widgetSnapshot(before), null);
}

/** Saves a standalone Widget (not on a Dashboard). */
export async function createWidget(ctx: ServiceContext, input: WidgetInput): Promise<Widget> {
  const values = parseInput(widgetInput, input);
  return mutate(ctx, (scope) => insertWidget(scope, values));
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
  await mutate(ctx, (scope) => removeWidget(scope, id));
}

export async function getWidget(ctx: ServiceContext, id: string): Promise<Widget> {
  return findWidget(ctx.db, id);
}

/** Every Widget, by name. */
export async function listWidgets(ctx: ServiceContext): Promise<Widget[]> {
  const result = await ctx.db.query<Widget>(`${SELECT_WIDGET} ORDER BY lower(w.name), w.id`);
  return result.rows.map(readWidget);
}

/** Runs a Widget: its query, or the Account balances in CHF today. */
export async function runSavedWidget(ctx: ServiceContext, widget: Widget): Promise<ReportTable> {
  return widget.source === 'account_balances'
    ? runAccountBalances(ctx, widget.query)
    : runWidgetQuery(ctx, widget.query);
}

/** Runs a saved Widget. */
export async function runWidget(ctx: ServiceContext, id: string): Promise<ReportTable> {
  return runSavedWidget(ctx, await getWidget(ctx, id));
}

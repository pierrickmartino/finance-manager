import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { withTransaction } from '@/server/db/transaction';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import type { HistorySnapshot } from '../history';
import {
  findDashboardWidgets,
  findWidget,
  insertWidget,
  removeWidget,
  widgetInput,
  type Widget,
  type WidgetInput,
  type WidgetLayout,
} from '../reporting/widgets';
import { insertAt, storyLayout, widgetLayoutInput } from './layout';

export { GRID_COLUMNS, DEFAULT_WIDGET_SIZE, MAX_WIDGET_HEIGHT } from './layout';
export { seedStarterDashboard, STARTER_DASHBOARD_NAME } from './seed';

/** A named, ordered set of Widgets (GLOSSARY: Dashboard). */
export interface Dashboard {
  id: string;
  name: string;
  createdAt: Date;
}

export interface DashboardWithWidgets extends Dashboard {
  /** In Story order. */
  widgets: Widget[];
}

const MAX_NAME_LENGTH = 100;

const dashboardInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Dashboard name is required')
    .max(MAX_NAME_LENGTH, `Dashboard name must be at most ${MAX_NAME_LENGTH} characters`),
});
export type DashboardInput = z.input<typeof dashboardInput>;

const SELECT_DASHBOARD = `SELECT d.id, d.name, d.created_at AS "createdAt" FROM dashboard d`;
const DASHBOARD_ORDER = 'd.sort, d.created_at, d.id';
const DASHBOARD_NOT_FOUND = 'Dashboard not found';
const uuid = z.uuid();

/** What History tracks of a Dashboard. Its position among Dashboards is layout, not History. */
function dashboardSnapshot(dashboard: Dashboard): HistorySnapshot {
  return { name: dashboard.name };
}

/** "Name (copy)", kept within the name length limit. */
function copyName(name: string): string {
  const suffix = ' (copy)';
  return `${name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
}

async function findDashboard(db: Queryable, id: string, lock = false): Promise<Dashboard> {
  if (!uuid.safeParse(id).success) throw new NotFoundError(DASHBOARD_NOT_FOUND);
  const result = await db.query<Dashboard>(
    `${SELECT_DASHBOARD} WHERE d.id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError(DASHBOARD_NOT_FOUND);
  return row;
}

/** Inserts a Dashboard after the others, inside an open mutation. */
export async function insertDashboard(scope: MutationScope, name: string): Promise<Dashboard> {
  const result = await scope.tx.query<{ id: string }>(
    `INSERT INTO dashboard (name, sort)
     VALUES ($1, (SELECT coalesce(max(sort) + 1, 0) FROM dashboard)) RETURNING id`,
    [name],
  );
  const dashboard = await findDashboard(scope.tx, result.rows[0]!.id);
  await scope.history.record('dashboard', dashboard.id, null, dashboardSnapshot(dashboard));
  return dashboard;
}

/** Every Dashboard, in the user's order. */
export async function listDashboards(ctx: ServiceContext): Promise<Dashboard[]> {
  const result = await ctx.db.query<Dashboard>(`${SELECT_DASHBOARD} ORDER BY ${DASHBOARD_ORDER}`);
  return result.rows;
}

/**
 * The home Dashboard among `dashboards` (in the user's order, as `listDashboards` gives them):
 * the one the home page opens, and the only one showing the Completeness check (ADR-0008).
 */
export function homeDashboard(dashboards: readonly Dashboard[]): Dashboard | undefined {
  return dashboards[0];
}

/** A Dashboard with its Widgets. */
export async function getDashboard(ctx: ServiceContext, id: string): Promise<DashboardWithWidgets> {
  const dashboard = await findDashboard(ctx.db, id);
  return { ...dashboard, widgets: await findDashboardWidgets(ctx.db, id) };
}

export async function createDashboard(
  ctx: ServiceContext,
  input: DashboardInput,
): Promise<Dashboard> {
  const { name } = parseInput(dashboardInput, input);
  return mutate(ctx, (scope) => insertDashboard(scope, name));
}

export async function renameDashboard(
  ctx: ServiceContext,
  id: string,
  input: DashboardInput,
): Promise<Dashboard> {
  const { name } = parseInput(dashboardInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findDashboard(tx, id, true);
    await tx.query('UPDATE dashboard SET name = $2 WHERE id = $1', [id, name]);
    const after = await findDashboard(tx, id);
    await history.record('dashboard', id, dashboardSnapshot(before), dashboardSnapshot(after));
    return after;
  });
}

/**
 * Puts the Dashboards in the given order (every Dashboard listed once). Like the order of a
 * Dashboard's Widgets, it is arrangement, not content: it writes no History.
 */
export async function reorderDashboards(ctx: ServiceContext, ids: string[]): Promise<void> {
  const order = parseInput(z.array(z.string()), ids);
  await withTransaction(ctx.db, async (tx) => {
    const current = await tx.query<{ id: string }>('SELECT id FROM dashboard FOR UPDATE');
    const known = new Set(current.rows.map((row) => row.id));
    if (order.length !== known.size || new Set(order).size !== order.length) {
      throw new ValidationError('List every Dashboard once');
    }
    if (!order.every((id) => known.has(id))) throw new ValidationError('List every Dashboard once');
    await tx.query(
      `UPDATE dashboard d SET sort = o.position
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, position) WHERE d.id = o.id`,
      [order],
    );
  });
}

/** Copies a Dashboard and all its Widgets (queries, visualisations, layout), as one Batch. */
export async function duplicateDashboard(ctx: ServiceContext, id: string): Promise<Dashboard> {
  return mutate(ctx, async (scope) => {
    const source = await findDashboard(scope.tx, id);
    const copy = await insertDashboard(scope, copyName(source.name));
    for (const widget of await findDashboardWidgets(scope.tx, id)) {
      await insertWidget(scope, { ...widget, dashboardId: copy.id });
    }
    await scope.history.summarize(`Duplicated the Dashboard "${source.name}"`);
    return copy;
  });
}

/** Deletes a Dashboard and its Widgets, recording each deletion in one Batch. */
export async function deleteDashboard(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async (scope) => {
    const before = await findDashboard(scope.tx, id, true);
    for (const widget of await findDashboardWidgets(scope.tx, id)) {
      await removeWidget(scope, widget.id);
    }
    await scope.tx.query('DELETE FROM dashboard WHERE id = $1', [id]);
    await scope.history.record('dashboard', id, dashboardSnapshot(before), null);
  });
}

/** Where a Widget goes among a Dashboard's Widgets: 0 is first; none, or past the end, is last. */
const positionInput = z.number().int().min(0, 'A position starts at 0').optional();

/**
 * Writes `ordered` as the Dashboard's Story order: the nth Widget at `y` n, `x` 0, its size kept.
 * This turns a layout left from the former grid into Story order. Order isn't History (spec 117).
 */
async function writeOrder(tx: Queryable, ordered: readonly Widget[]): Promise<Widget[]> {
  const placed = ordered.map((widget, index) => ({
    ...widget,
    layout: storyLayout(index, widget.layout ?? undefined),
  }));
  await tx.query(
    `UPDATE widget w SET layout = item.layout
     FROM jsonb_to_recordset($1::jsonb) AS item(id uuid, layout jsonb)
     WHERE w.id = item.id`,
    [JSON.stringify(placed.map(({ id, layout }) => ({ id, layout })))],
  );
  return placed;
}

/** Inserts `widget` among the Dashboard's other Widgets and returns it with its final place. */
async function placeAmong(
  tx: Queryable,
  siblings: readonly Widget[],
  widget: Widget,
  position?: number,
): Promise<Widget> {
  const placed = await writeOrder(tx, insertAt(siblings, widget, position));
  return placed.find((item) => item.id === widget.id)!;
}

/**
 * Adds a Widget to a Dashboard at `position` (last without one). A given `layout` is stored as
 * it is, leaving the other Widgets alone (the starter Dashboard).
 */
export async function addWidget(
  ctx: ServiceContext,
  dashboardId: string,
  input: WidgetInput & { source?: Widget['source']; layout?: WidgetLayout; position?: number },
): Promise<Widget> {
  const values = parseInput(widgetInput, input);
  const source = parseInput(z.enum(['query', 'account_balances']).default('query'), input.source);
  const layout = input.layout ? parseInput(widgetLayoutInput, input.layout) : null;
  const position = parseInput(positionInput, input.position);
  return mutate(ctx, async (scope) => {
    await findDashboard(scope.tx, dashboardId, true);
    const siblings = await findDashboardWidgets(scope.tx, dashboardId);
    const widget = await insertWidget(scope, {
      ...values,
      source,
      dashboardId,
      layout: layout ?? storyLayout(siblings.length),
    });
    return layout ? widget : placeAmong(scope.tx, siblings, widget, position);
  });
}

/** Copies a Widget (query and visualisation) onto the same Dashboard, right after it. */
export async function duplicateWidget(ctx: ServiceContext, id: string): Promise<Widget> {
  return mutate(ctx, async (scope) => {
    const widget = await findWidget(scope.tx, id);
    if (!widget.dashboardId) {
      return insertWidget(scope, { ...widget, name: copyName(widget.name), layout: null });
    }
    const siblings = await findDashboardWidgets(scope.tx, widget.dashboardId);
    const copy = await insertWidget(scope, { ...widget, name: copyName(widget.name) });
    const after = siblings.findIndex((sibling) => sibling.id === widget.id) + 1;
    return placeAmong(scope.tx, siblings, copy, after);
  });
}

/**
 * Places a copy of a Widget (a Standalone Widget or one from another Dashboard) on a Dashboard
 * at `position` (last without one), at the original's size if it has one. The original is left
 * as it is (GLOSSARY: Standalone Widget).
 */
export async function copyWidgetToDashboard(
  ctx: ServiceContext,
  widgetId: string,
  dashboardId: string,
  position?: number,
): Promise<Widget> {
  const at = parseInput(positionInput, position);
  return mutate(ctx, async (scope) => {
    const widget = await findWidget(scope.tx, widgetId);
    await findDashboard(scope.tx, dashboardId, true);
    const siblings = await findDashboardWidgets(scope.tx, dashboardId);
    const copy = await insertWidget(scope, {
      ...widget,
      dashboardId,
      layout: storyLayout(siblings.length, widget.layout ?? undefined),
    });
    return placeAmong(scope.tx, siblings, copy, at);
  });
}

const widgetIdsInput = z.array(z.uuid({ error: 'Unknown Widget' }));
const WIDGET_ORDER_MISMATCH = 'List every Widget of this Dashboard once';

/**
 * Puts a Dashboard's Widgets in the given Story order (every Widget listed once). Order isn't
 * History (spec 117): this writes none.
 */
export async function reorderDashboardWidgets(
  ctx: ServiceContext,
  dashboardId: string,
  widgetIds: string[],
): Promise<void> {
  const ids = parseInput(widgetIdsInput, widgetIds);
  await withTransaction(ctx.db, async (tx) => {
    await findDashboard(tx, dashboardId, true);
    const byId = new Map(
      (await findDashboardWidgets(tx, dashboardId)).map((widget) => [widget.id, widget]),
    );
    const ordered = ids.map((id) => byId.get(id));
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== byId.size ||
      ordered.includes(undefined)
    ) {
      throw new ValidationError(WIDGET_ORDER_MISMATCH);
    }
    await writeOrder(tx, ordered as Widget[]);
  });
}

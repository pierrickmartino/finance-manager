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
import { placeAtBottom, widgetLayoutInput } from './layout';

export { GRID_COLUMNS, DEFAULT_WIDGET_SIZE, MAX_WIDGET_HEIGHT } from './layout';
export { seedStarterDashboard, STARTER_DASHBOARD_NAME } from './seed';

/** A named grid of Widgets (GLOSSARY: Dashboard). */
export interface Dashboard {
  id: string;
  name: string;
  createdAt: Date;
}

export interface DashboardWithWidgets extends Dashboard {
  /** Top to bottom, left to right. */
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
 * Puts the Dashboards in the given order (every Dashboard listed once). Like the grid layout,
 * the order is arrangement, not content: it writes no History.
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

/** Adds a Widget to a Dashboard, below the others unless a layout is given. */
export async function addWidget(
  ctx: ServiceContext,
  dashboardId: string,
  input: WidgetInput & { source?: Widget['source']; layout?: WidgetLayout },
): Promise<Widget> {
  const values = parseInput(widgetInput, input);
  const source = parseInput(z.enum(['query', 'account_balances']).default('query'), input.source);
  const layout = input.layout ? parseInput(widgetLayoutInput, input.layout) : null;
  return mutate(ctx, async (scope) => {
    await findDashboard(scope.tx, dashboardId, true);
    const widgets = await findDashboardWidgets(scope.tx, dashboardId);
    return insertWidget(scope, {
      ...values,
      source,
      dashboardId,
      layout: layout ?? placeAtBottom(widgets.map((widget) => widget.layout)),
    });
  });
}

/** Copies a Widget (query and visualisation) onto the same Dashboard, below the others. */
export async function duplicateWidget(ctx: ServiceContext, id: string): Promise<Widget> {
  return mutate(ctx, async (scope) => {
    const widget = await findWidget(scope.tx, id);
    const siblings = widget.dashboardId
      ? await findDashboardWidgets(scope.tx, widget.dashboardId)
      : [];
    const size = widget.layout ?? undefined;
    return insertWidget(scope, {
      ...widget,
      name: copyName(widget.name),
      layout: widget.dashboardId
        ? placeAtBottom(
            siblings.map((sibling) => sibling.layout),
            size,
          )
        : null,
    });
  });
}

const layoutItemsInput = z.array(
  z.object({ widgetId: z.uuid({ error: 'Unknown Widget' }), layout: widgetLayoutInput }).strict(),
);
export type DashboardLayoutInput = z.input<typeof layoutItemsInput>;

/**
 * Saves the positions and sizes of a Dashboard's Widgets (after a drag or a resize). Layout
 * isn't History (spec 117): this writes none. Widgets not listed keep their layout.
 */
export async function saveDashboardLayout(
  ctx: ServiceContext,
  dashboardId: string,
  items: DashboardLayoutInput,
): Promise<void> {
  const values = parseInput(layoutItemsInput, items);
  await withTransaction(ctx.db, async (tx) => {
    await findDashboard(tx, dashboardId, true);
    const result = await tx.query(
      `UPDATE widget w SET layout = item.layout
       FROM jsonb_to_recordset($2::jsonb) AS item("widgetId" uuid, layout jsonb)
       WHERE w.id = item."widgetId" AND w.dashboard_id = $1`,
      [dashboardId, JSON.stringify(values)],
    );
    if (result.rowCount !== values.length) {
      throw new ValidationError('A Widget in this layout is not on this Dashboard');
    }
  });
}

import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { listHistory } from '../history';
import {
  createWidget,
  deleteWidget,
  getWidget,
  updateWidget,
  type WidgetQueryInput,
} from '../reporting';
import {
  addWidget,
  copyWidgetToDashboard,
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  duplicateWidget,
  getDashboard,
  listDashboards,
  renameDashboard,
  reorderDashboards,
  reorderDashboardWidgets,
} from '.';

const t = setupTestDatabase();

describe('Dashboards', () => {
  it('creates Dashboards in order and records their creation in History', async () => {
    const home = await createDashboard(t.ctx, { name: ' Home ' });
    const travel = await createDashboard(t.ctx, { name: 'Travel' });

    expect(home).toMatchObject({ name: 'Home' });
    expect((await listDashboards(t.ctx)).map((d) => d.name)).toEqual(['Home', 'Travel']);
    expect(await getDashboard(t.ctx, travel.id)).toMatchObject({ name: 'Travel', widgets: [] });
    expect(await listHistory(t.ctx, { entityType: 'dashboard', entityId: home.id })).toEqual([
      expect.objectContaining({ field: 'name', before: null, after: 'Home' }),
    ]);
  });

  it('refuses a blank name', async () => {
    await expect(createDashboard(t.ctx, { name: '  ' })).rejects.toThrow(
      'Dashboard name is required',
    );
  });

  it('renames a Dashboard with History', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });

    await renameDashboard(t.ctx, dashboard.id, { name: 'Overview' });

    expect(await getDashboard(t.ctx, dashboard.id)).toMatchObject({ name: 'Overview' });
    expect(await listHistory(t.ctx, { entityType: 'dashboard', entityId: dashboard.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', before: 'Home', after: 'Overview' }),
      ]),
    );
  });

  it('reorders Dashboards without writing History', async () => {
    const a = await createDashboard(t.ctx, { name: 'A' });
    const b = await createDashboard(t.ctx, { name: 'B' });
    const c = await createDashboard(t.ctx, { name: 'C' });
    const historyBefore = await listHistory(t.ctx, {});

    await reorderDashboards(t.ctx, [c.id, a.id, b.id]);

    expect((await listDashboards(t.ctx)).map((d) => d.name)).toEqual(['C', 'A', 'B']);
    expect(await listHistory(t.ctx, {})).toEqual(historyBefore);
    await expect(reorderDashboards(t.ctx, [c.id, a.id])).rejects.toThrow(
      'List every Dashboard once',
    );
  });

  it('finds no Dashboard for an unknown id', async () => {
    await expect(getDashboard(t.ctx, 'nope')).rejects.toThrow('Dashboard not found');
  });
});

/** A Dashboard's Widgets as [name, y], in the order the Story tells them. */
async function storyOrder(dashboardId: string): Promise<[string, number | undefined][]> {
  const { widgets } = await getDashboard(t.ctx, dashboardId);
  return widgets.map((w) => [w.name, w.layout?.y]);
}

const SPENDING: WidgetQueryInput = {
  dateRange: { kind: 'last', count: 12, unit: 'month' },
  rows: 'month',
  columns: 'category',
};

describe('Widgets on a Dashboard', () => {
  it('adds Widgets after each other in Story order and records their creation', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });

    const first = await addWidget(t.ctx, dashboard.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'stacked_bar',
    });
    const second = await addWidget(t.ctx, dashboard.id, { name: 'Again', query: SPENDING });

    expect(first).toMatchObject({
      dashboardId: dashboard.id,
      source: 'query',
      visualisation: 'stacked_bar',
      layout: { x: 0, y: 0, w: 6, h: 8 },
    });
    expect(second.layout).toEqual({ x: 0, y: 1, w: 6, h: 8 });
    expect((await getDashboard(t.ctx, dashboard.id)).widgets.map((w) => w.name)).toEqual([
      'Spending',
      'Again',
    ]);
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: first.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', after: 'Spending' }),
        expect.objectContaining({ field: 'dashboardId', after: dashboard.id }),
        expect.objectContaining({ field: 'visualisation', after: 'stacked_bar' }),
      ]),
    );
  });

  it('refuses a Widget for an unknown Dashboard', async () => {
    await expect(
      addWidget(t.ctx, '00000000-0000-4000-8000-000000000000', { name: 'X', query: SPENDING }),
    ).rejects.toThrow('Dashboard not found');
  });

  it('adds a Widget at a position, moving the ones after it down', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    await addWidget(t.ctx, dashboard.id, { name: 'A', query: SPENDING });
    await addWidget(t.ctx, dashboard.id, { name: 'C', query: SPENDING });

    const b = await addWidget(t.ctx, dashboard.id, { name: 'B', query: SPENDING, position: 1 });
    await addWidget(t.ctx, dashboard.id, { name: 'Z', query: SPENDING, position: 99 });

    expect(b.layout).toEqual({ x: 0, y: 1, w: 6, h: 8 });
    expect(await storyOrder(dashboard.id)).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2],
      ['Z', 3],
    ]);
  });

  it('refuses a negative position', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });

    await expect(
      addWidget(t.ctx, dashboard.id, { name: 'A', query: SPENDING, position: -1 }),
    ).rejects.toThrow();
  });

  it('reorders the Widgets of a Dashboard, keeping their sizes, without writing History', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const a = await addWidget(t.ctx, dashboard.id, { name: 'A', query: SPENDING });
    const b = await addWidget(t.ctx, dashboard.id, {
      name: 'B',
      query: SPENDING,
      layout: { x: 6, y: 0, w: 6, h: 10 },
    });
    const c = await addWidget(t.ctx, dashboard.id, { name: 'C', query: SPENDING });
    const historyBefore = await listHistory(t.ctx, {});

    await reorderDashboardWidgets(t.ctx, dashboard.id, [c.id, a.id, b.id]);

    const { widgets } = await getDashboard(t.ctx, dashboard.id);
    expect(widgets.map((w) => [w.name, w.layout])).toEqual([
      ['C', { x: 0, y: 0, w: 6, h: 8 }],
      ['A', { x: 0, y: 1, w: 6, h: 8 }],
      ['B', { x: 0, y: 2, w: 6, h: 10 }],
    ]);
    expect(await listHistory(t.ctx, {})).toEqual(historyBefore);
  });

  it('turns an old grid layout into Story order on the first change', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Right',
      query: SPENDING,
      layout: { x: 6, y: 0, w: 6, h: 8 },
    });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Left',
      query: SPENDING,
      layout: { x: 0, y: 0, w: 6, h: 8 },
    });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Below',
      query: SPENDING,
      layout: { x: 0, y: 8, w: 12, h: 4 },
    });

    await addWidget(t.ctx, dashboard.id, { name: 'New', query: SPENDING });

    expect(await storyOrder(dashboard.id)).toEqual([
      ['Left', 0],
      ['Right', 1],
      ['Below', 2],
      ['New', 3],
    ]);
  });

  it('refuses an order that leaves out, repeats or adds a Widget', async () => {
    const home = await createDashboard(t.ctx, { name: 'Home' });
    const other = await createDashboard(t.ctx, { name: 'Other' });
    const a = await addWidget(t.ctx, home.id, { name: 'A', query: SPENDING });
    const b = await addWidget(t.ctx, home.id, { name: 'B', query: SPENDING });
    const stranger = await addWidget(t.ctx, other.id, { name: 'X', query: SPENDING });
    const message = 'List every Widget of this Dashboard once';

    await expect(reorderDashboardWidgets(t.ctx, home.id, [b.id])).rejects.toThrow(message);
    await expect(reorderDashboardWidgets(t.ctx, home.id, [b.id, b.id])).rejects.toThrow(message);
    await expect(
      reorderDashboardWidgets(t.ctx, home.id, [b.id, a.id, stranger.id]),
    ).rejects.toThrow(message);
    expect(await storyOrder(home.id)).toEqual([
      ['A', 0],
      ['B', 1],
    ]);
  });

  it('duplicates a Widget with its query and visualisation, right after the original', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'donut',
      layout: { x: 3, y: 0, w: 4, h: 5 },
    });
    await addWidget(t.ctx, dashboard.id, { name: 'Last', query: SPENDING });

    const copy = await duplicateWidget(t.ctx, widget.id);

    expect(copy).toMatchObject({
      name: 'Spending (copy)',
      dashboardId: dashboard.id,
      query: widget.query,
      visualisation: 'donut',
      layout: { x: 0, y: 1, w: 4, h: 5 },
    });
    expect(copy.id).not.toBe(widget.id);
    expect(await storyOrder(dashboard.id)).toEqual([
      ['Spending', 0],
      ['Spending (copy)', 1],
      ['Last', 2],
    ]);
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: copy.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', after: 'Spending (copy)' }),
      ]),
    );
  });

  it('duplicates a Dashboard with its Widgets as one Batch', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'line',
    });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Balances',
      query: SPENDING,
      source: 'account_balances',
    });

    const copy = await duplicateDashboard(t.ctx, dashboard.id);

    expect(copy.name).toBe('Home (copy)');
    const copied = await getDashboard(t.ctx, copy.id);
    expect(copied.widgets.map((w) => [w.name, w.source, w.visualisation, w.layout])).toEqual([
      ['Spending', 'query', 'line', widget.layout],
      ['Balances', 'account_balances', 'table', { x: 0, y: 1, w: 6, h: 8 }],
    ]);
    expect(copied.widgets[0]!.query).toEqual(widget.query);
    expect((await listDashboards(t.ctx)).map((d) => d.name)).toEqual(['Home', 'Home (copy)']);
    const [entry] = await listHistory(t.ctx, { entityType: 'dashboard', entityId: copy.id });
    const batch = await listHistory(t.ctx, { batchId: entry!.batchId });
    expect(new Set(batch.map((e) => e.entityType))).toEqual(new Set(['dashboard', 'widget']));
  });

  it('deletes a Dashboard with its Widgets, recording every deletion', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, { name: 'Spending', query: SPENDING });

    await deleteDashboard(t.ctx, dashboard.id);

    expect(await listDashboards(t.ctx)).toEqual([]);
    await expect(getWidget(t.ctx, widget.id)).rejects.toThrow('Widget not found');
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: widget.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', before: 'Spending', after: null }),
      ]),
    );
    expect(await listHistory(t.ctx, { entityType: 'dashboard', entityId: dashboard.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', before: 'Home', after: null }),
      ]),
    );
  });

  it('edits and deletes a Widget of a Dashboard with History, keeping its place', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, { name: 'Spending', query: SPENDING });

    const updated = await updateWidget(t.ctx, widget.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'stacked_bar',
    });
    expect(updated).toMatchObject({ dashboardId: dashboard.id, layout: widget.layout });
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: widget.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'visualisation', before: 'table', after: 'stacked_bar' }),
      ]),
    );

    await deleteWidget(t.ctx, widget.id);
    expect((await getDashboard(t.ctx, dashboard.id)).widgets).toEqual([]);
  });
  it('copies a Standalone Widget onto a Dashboard, after the others, leaving the original', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    await addWidget(t.ctx, dashboard.id, { name: 'First', query: SPENDING });
    const standalone = await createWidget(t.ctx, {
      name: 'Groceries',
      query: SPENDING,
      visualisation: 'line',
    });

    const copy = await copyWidgetToDashboard(t.ctx, standalone.id, dashboard.id);

    expect(copy).toMatchObject({
      name: 'Groceries',
      dashboardId: dashboard.id,
      source: 'query',
      query: standalone.query,
      visualisation: 'line',
      layout: { x: 0, y: 1, w: 6, h: 8 },
    });
    expect(copy.id).not.toBe(standalone.id);
    expect(await getWidget(t.ctx, standalone.id)).toEqual(standalone);
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: copy.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', before: null, after: 'Groceries' }),
      ]),
    );
  });

  it('copies a Widget from another Dashboard with its source and size', async () => {
    const home = await createDashboard(t.ctx, { name: 'Home' });
    const travel = await createDashboard(t.ctx, { name: 'Travel' });
    const balances = await addWidget(t.ctx, home.id, {
      name: 'Balances',
      query: SPENDING,
      source: 'account_balances',
      layout: { x: 4, y: 0, w: 8, h: 5 },
    });

    const copy = await copyWidgetToDashboard(t.ctx, balances.id, travel.id);

    expect(copy).toMatchObject({
      name: 'Balances',
      dashboardId: travel.id,
      source: 'account_balances',
      layout: { x: 0, y: 0, w: 8, h: 5 },
    });
    expect((await getDashboard(t.ctx, home.id)).widgets.map((w) => w.id)).toEqual([balances.id]);
  });

  it('copies a Widget onto a Dashboard at a position', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    await addWidget(t.ctx, dashboard.id, { name: 'First', query: SPENDING });
    await addWidget(t.ctx, dashboard.id, { name: 'Second', query: SPENDING });
    const standalone = await createWidget(t.ctx, { name: 'Groceries', query: SPENDING });

    await copyWidgetToDashboard(t.ctx, standalone.id, dashboard.id, 0);

    expect(await storyOrder(dashboard.id)).toEqual([
      ['Groceries', 0],
      ['First', 1],
      ['Second', 2],
    ]);
  });

  it('refuses to copy an unknown Widget or onto an unknown Dashboard', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await createWidget(t.ctx, { name: 'A', query: SPENDING });
    const missing = '00000000-0000-4000-8000-000000000000';

    await expect(copyWidgetToDashboard(t.ctx, missing, dashboard.id)).rejects.toThrow(
      'Widget not found',
    );
    await expect(copyWidgetToDashboard(t.ctx, widget.id, missing)).rejects.toThrow(
      'Dashboard not found',
    );
  });
});

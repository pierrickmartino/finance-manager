import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { listHistory } from '../history';
import { deleteWidget, getWidget, updateWidget, type WidgetQueryInput } from '../reporting';
import {
  addWidget,
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  duplicateWidget,
  getDashboard,
  listDashboards,
  renameDashboard,
  reorderDashboards,
  saveDashboardLayout,
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

const SPENDING: WidgetQueryInput = {
  dateRange: { kind: 'last', count: 12, unit: 'month' },
  rows: 'month',
  columns: 'category',
};

describe('Widgets on a Dashboard', () => {
  it('adds Widgets below each other and records their creation', async () => {
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
    expect(second.layout).toEqual({ x: 0, y: 8, w: 6, h: 8 });
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

  it('saves the layout without writing History', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const a = await addWidget(t.ctx, dashboard.id, { name: 'A', query: SPENDING });
    const b = await addWidget(t.ctx, dashboard.id, { name: 'B', query: SPENDING });
    const historyBefore = await listHistory(t.ctx, {});

    await saveDashboardLayout(t.ctx, dashboard.id, [
      { widgetId: a.id, layout: { x: 6, y: 0, w: 6, h: 4 } },
      { widgetId: b.id, layout: { x: 0, y: 0, w: 6, h: 10 } },
    ]);

    const { widgets } = await getDashboard(t.ctx, dashboard.id);
    expect(widgets.map((w) => [w.name, w.layout])).toEqual([
      ['B', { x: 0, y: 0, w: 6, h: 10 }],
      ['A', { x: 6, y: 0, w: 6, h: 4 }],
    ]);
    expect(await listHistory(t.ctx, {})).toEqual(historyBefore);
  });

  it('refuses a layout outside the grid or for a Widget of another Dashboard', async () => {
    const home = await createDashboard(t.ctx, { name: 'Home' });
    const other = await createDashboard(t.ctx, { name: 'Other' });
    const widget = await addWidget(t.ctx, home.id, { name: 'A', query: SPENDING });

    await expect(
      saveDashboardLayout(t.ctx, home.id, [
        { widgetId: widget.id, layout: { x: 8, y: 0, w: 6, h: 4 } },
      ]),
    ).rejects.toThrow('A Widget must fit in the 12 grid columns');
    await expect(
      saveDashboardLayout(t.ctx, other.id, [
        { widgetId: widget.id, layout: { x: 0, y: 0, w: 6, h: 4 } },
      ]),
    ).rejects.toThrow('A Widget in this layout is not on this Dashboard');
    expect((await getWidget(t.ctx, widget.id)).layout).toEqual({ x: 0, y: 0, w: 6, h: 8 });
  });

  it('duplicates a Widget with its query and visualisation, below the others', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'donut',
      layout: { x: 3, y: 0, w: 4, h: 5 },
    });

    const copy = await duplicateWidget(t.ctx, widget.id);

    expect(copy).toMatchObject({
      name: 'Spending (copy)',
      dashboardId: dashboard.id,
      query: widget.query,
      visualisation: 'donut',
      layout: { x: 0, y: 5, w: 4, h: 5 },
    });
    expect(copy.id).not.toBe(widget.id);
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
      ['Balances', 'account_balances', 'table', { x: 0, y: 8, w: 6, h: 8 }],
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
});

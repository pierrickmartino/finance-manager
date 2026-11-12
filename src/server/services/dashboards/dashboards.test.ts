import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { listHistory } from '../history';
import {
  createWidget,
  deleteWidget,
  getWidget,
  updateWidget,
  type WidgetLayout,
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

/** A Dashboard's Widgets as [name, layout], in reading order. */
async function board(dashboardId: string): Promise<[string, WidgetLayout | null][]> {
  const { widgets } = await getDashboard(t.ctx, dashboardId);
  return widgets.map((w) => [w.name, w.layout]);
}

const SPENDING: WidgetQueryInput = {
  dateRange: { kind: 'last', count: 12, unit: 'month' },
  rows: 'month',
  columns: 'category',
};

describe('Widgets on a Dashboard', () => {
  it('adds Widgets at their default size in the first free spot, recording their creation', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });

    const trend = await addWidget(t.ctx, dashboard.id, {
      name: 'Trend',
      query: SPENDING,
      visualisation: 'line',
    });
    const number = await addWidget(t.ctx, dashboard.id, {
      name: 'Total',
      query: SPENDING,
      visualisation: 'number',
    });
    const balances = await addWidget(t.ctx, dashboard.id, {
      name: 'Balances',
      query: SPENDING,
      source: 'account_balances',
    });
    const table = await addWidget(t.ctx, dashboard.id, { name: 'Table', query: SPENDING });

    expect(trend).toMatchObject({
      dashboardId: dashboard.id,
      source: 'query',
      visualisation: 'line',
      layout: { x: 0, y: 0, w: 8, h: 6 },
    });
    // The rest of the top row first, then a new row under the lowest-starting card.
    expect(number.layout).toEqual({ x: 8, y: 0, w: 4, h: 3 });
    expect(balances.layout).toEqual({ x: 8, y: 3, w: 4, h: 6 });
    expect(table.layout).toEqual({ x: 0, y: 6, w: 8, h: 8 });
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: trend.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', after: 'Trend' }),
        expect.objectContaining({ field: 'dashboardId', after: dashboard.id }),
        expect.objectContaining({ field: 'visualisation', after: 'line' }),
      ]),
    );
  });

  it('refuses a Widget for an unknown Dashboard', async () => {
    await expect(
      addWidget(t.ctx, '00000000-0000-4000-8000-000000000000', { name: 'X', query: SPENDING }),
    ).rejects.toThrow('Dashboard not found');
  });

  it('saves a whole layout as given, gaps kept, writing no History', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const trend = await addWidget(t.ctx, dashboard.id, {
      name: 'Trend',
      query: SPENDING,
      visualisation: 'line',
    });
    const total = await addWidget(t.ctx, dashboard.id, {
      name: 'Total',
      query: SPENDING,
      visualisation: 'number',
    });
    const historyBefore = await listHistory(t.ctx, {});

    await saveDashboardLayout(t.ctx, dashboard.id, [
      { id: trend.id, x: 2, y: 5, w: 10, h: 7 },
      { id: total.id, x: 0, y: 0, w: 2, h: 2 },
    ]);

    expect(await board(dashboard.id)).toEqual([
      ['Total', { x: 0, y: 0, w: 2, h: 2 }],
      ['Trend', { x: 2, y: 5, w: 10, h: 7 }],
    ]);
    expect(await listHistory(t.ctx, {})).toEqual(historyBefore);
  });

  it('refuses a layout that leaves out, repeats or adds a Widget, keeping the stored one', async () => {
    const home = await createDashboard(t.ctx, { name: 'Home' });
    const other = await createDashboard(t.ctx, { name: 'Other' });
    const a = await addWidget(t.ctx, home.id, { name: 'A', query: SPENDING });
    const b = await addWidget(t.ctx, home.id, { name: 'B', query: SPENDING });
    const stranger = await addWidget(t.ctx, other.id, { name: 'X', query: SPENDING });
    const before = await board(home.id);
    const message = 'List every Widget of this Dashboard once';
    const at = (id: string, y: number) => ({ id, x: 0, y, w: 4, h: 8 });

    await expect(saveDashboardLayout(t.ctx, home.id, [at(b.id, 0)])).rejects.toThrow(message);
    await expect(saveDashboardLayout(t.ctx, home.id, [at(b.id, 0), at(b.id, 8)])).rejects.toThrow(
      message,
    );
    await expect(
      saveDashboardLayout(t.ctx, home.id, [at(a.id, 0), at(b.id, 8), at(stranger.id, 16)]),
    ).rejects.toThrow(message);
    await expect(
      saveDashboardLayout(t.ctx, home.id, [at(a.id, 0), at(stranger.id, 8)]),
    ).rejects.toThrow(message);
    expect(await board(home.id)).toEqual(before);
  });

  it('refuses a card that leaves the columns or rows, goes under its minimum or overlaps another', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const trend = await addWidget(t.ctx, dashboard.id, {
      name: 'Trend',
      query: SPENDING,
      visualisation: 'line',
    });
    const total = await addWidget(t.ctx, dashboard.id, {
      name: 'Total',
      query: SPENDING,
      visualisation: 'number',
    });
    const before = await board(dashboard.id);
    const save = (trendCell: WidgetLayout, totalCell: WidgetLayout = { x: 0, y: 10, w: 2, h: 2 }) =>
      saveDashboardLayout(t.ctx, dashboard.id, [
        { id: trend.id, ...trendCell },
        { id: total.id, ...totalCell },
      ]);

    await expect(save({ x: 6, y: 0, w: 8, h: 6 })).rejects.toThrow(
      'A Widget must fit in the 12 grid columns',
    );
    await expect(save({ x: 0, y: 9_996, w: 8, h: 6 })).rejects.toThrow(
      "A Widget must fit in the board's 10000 rows",
    );
    await expect(save({ x: 0, y: 0, w: 4.5, h: 6 })).rejects.toThrow();
    // A trend can't be read under 4×4; a Number can (2×2).
    await expect(save({ x: 0, y: 0, w: 3, h: 6 })).rejects.toThrow(
      'Trend must be at least 4 columns wide and 4 rows tall',
    );
    await expect(save({ x: 0, y: 0, w: 8, h: 3 })).rejects.toThrow(
      'Trend must be at least 4 columns wide and 4 rows tall',
    );
    await expect(save({ x: 0, y: 0, w: 8, h: 6 }, { x: 7, y: 5, w: 4, h: 3 })).rejects.toThrow(
      'Trend and Total overlap',
    );
    expect(await board(dashboard.id)).toEqual(before);
  });

  it('duplicates a Widget at its size in the first free spot next to its original', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'donut',
      layout: { x: 0, y: 0, w: 4, h: 5 },
    });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Neighbour',
      query: SPENDING,
      layout: { x: 4, y: 0, w: 8, h: 6 },
    });

    const copy = await duplicateWidget(t.ctx, widget.id);
    const another = await duplicateWidget(t.ctx, widget.id);

    expect(copy).toMatchObject({
      name: 'Spending (copy)',
      dashboardId: dashboard.id,
      query: widget.query,
      visualisation: 'donut',
      // Its right is taken, so right below it.
      layout: { x: 0, y: 5, w: 4, h: 5 },
    });
    expect(copy.id).not.toBe(widget.id);
    // Right of it and right below it are both taken: the first free spot under it.
    expect(another.layout).toEqual({ x: 4, y: 6, w: 4, h: 5 });
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: copy.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', after: 'Spending (copy)' }),
      ]),
    );
  });

  it('gives the copy of a Dashboard Widget without a layout its default size in the first free spot', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Top',
      query: SPENDING,
      layout: { x: 0, y: 0, w: 12, h: 3 },
    });
    const unplaced = await addWidget(t.ctx, dashboard.id, {
      name: 'Total',
      query: SPENDING,
      visualisation: 'number',
    });
    await t.ctx.db.query('UPDATE widget SET layout = NULL WHERE id = $1', [unplaced.id]);

    const copy = await duplicateWidget(t.ctx, unplaced.id);

    // A Number's default size (4×3), at the bottom of the board.
    expect(copy).toMatchObject({ dashboardId: dashboard.id, layout: { x: 0, y: 3, w: 4, h: 3 } });
  });

  it('duplicates a Dashboard with its Widgets and their layouts, as one Batch', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const widget = await addWidget(t.ctx, dashboard.id, {
      name: 'Spending',
      query: SPENDING,
      visualisation: 'line',
      layout: { x: 2, y: 1, w: 7, h: 9 },
    });
    const balances = await addWidget(t.ctx, dashboard.id, {
      name: 'Balances',
      query: SPENDING,
      source: 'account_balances',
    });

    const copy = await duplicateDashboard(t.ctx, dashboard.id);

    expect(copy.name).toBe('Home (copy)');
    const copied = await getDashboard(t.ctx, copy.id);
    expect(copied.widgets.map((w) => [w.name, w.source, w.visualisation, w.layout])).toEqual([
      ['Spending', 'query', 'line', { x: 2, y: 1, w: 7, h: 9 }],
      ['Balances', 'account_balances', 'table', balances.layout],
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

  it('edits a Widget of a Dashboard with History, keeping its place', async () => {
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
  });

  it('grows a Widget to the minimum of its new chart type and pushes the cards below down, recording only the edit', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const total = await addWidget(t.ctx, dashboard.id, {
      name: 'Total',
      query: SPENDING,
      visualisation: 'number',
      layout: { x: 0, y: 0, w: 3, h: 2 },
    });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Beside',
      query: SPENDING,
      visualisation: 'line',
      layout: { x: 4, y: 0, w: 8, h: 6 },
    });
    await addWidget(t.ctx, dashboard.id, {
      name: 'Below',
      query: SPENDING,
      visualisation: 'number',
      layout: { x: 0, y: 2, w: 4, h: 3 },
    });
    const historyBefore = await listHistory(t.ctx, {});

    // A Number (minimum 2×2) becomes a Line (a trend: minimum 4×4).
    const updated = await updateWidget(t.ctx, total.id, {
      name: 'Total',
      query: SPENDING,
      visualisation: 'line',
    });

    expect(updated.layout).toEqual({ x: 0, y: 0, w: 4, h: 4 });
    expect(await board(dashboard.id)).toEqual([
      ['Total', { x: 0, y: 0, w: 4, h: 4 }],
      ['Beside', { x: 4, y: 0, w: 8, h: 6 }],
      ['Below', { x: 0, y: 4, w: 4, h: 3 }],
    ]);
    const historyAfter = await listHistory(t.ctx, {});
    const added = historyAfter.slice(0, historyAfter.length - historyBefore.length);
    expect(added).toEqual([
      expect.objectContaining({
        entityId: total.id,
        field: 'visualisation',
        before: 'number',
        after: 'line',
      }),
    ]);
  });

  it('keeps a Widget its size when its new chart type needs no more room', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const trend = await addWidget(t.ctx, dashboard.id, {
      name: 'Trend',
      query: SPENDING,
      visualisation: 'line',
    });
    const below = await addWidget(t.ctx, dashboard.id, {
      name: 'Below',
      query: SPENDING,
      layout: { x: 0, y: 6, w: 4, h: 8 },
    });

    // A Line (8×6) becomes a Number (minimum 2×2): never shrunk.
    await updateWidget(t.ctx, trend.id, {
      name: 'Trend',
      query: SPENDING,
      visualisation: 'number',
    });
    // A Table (4×8, minimum 3×5) becomes a Donut (also a list: same minimum).
    await updateWidget(t.ctx, below.id, { name: 'Below', query: SPENDING, visualisation: 'donut' });

    expect(await board(dashboard.id)).toEqual([
      ['Trend', trend.layout],
      ['Below', below.layout],
    ]);
  });

  it('leaves a card as it is when an edit keeps its chart kind, even under the minimum', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const trend = await addWidget(t.ctx, dashboard.id, {
      name: 'Trend',
      query: SPENDING,
      visualisation: 'line',
      // Under a trend's minimum (4×4), as a layout given on creation can be.
      layout: { x: 0, y: 0, w: 2, h: 2 },
    });

    const renamed = await updateWidget(t.ctx, trend.id, {
      name: 'Spending trend',
      query: SPENDING,
      visualisation: 'line',
    });

    expect(renamed.layout).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it('leaves a Standalone Widget without a layout when its chart type changes', async () => {
    const standalone = await createWidget(t.ctx, {
      name: 'Groceries',
      query: SPENDING,
      visualisation: 'number',
    });

    const updated = await updateWidget(t.ctx, standalone.id, {
      name: 'Groceries',
      query: SPENDING,
      visualisation: 'line',
    });

    expect(updated.layout).toBeNull();
  });

  it('deletes a Widget, leaving its space empty and the other layouts as they were', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    const first = await addWidget(t.ctx, dashboard.id, { name: 'First', query: SPENDING });
    const middle = await addWidget(t.ctx, dashboard.id, { name: 'Middle', query: SPENDING });
    const last = await addWidget(t.ctx, dashboard.id, {
      name: 'Last',
      query: SPENDING,
      layout: { x: 0, y: 8, w: 12, h: 4 },
    });

    await deleteWidget(t.ctx, middle.id);

    expect(await board(dashboard.id)).toEqual([
      ['First', first.layout],
      ['Last', last.layout],
    ]);
  });

  it('copies a Standalone Widget onto a Dashboard at its default size in the first free spot, leaving the original', async () => {
    const dashboard = await createDashboard(t.ctx, { name: 'Home' });
    await addWidget(t.ctx, dashboard.id, {
      name: 'First',
      query: SPENDING,
      layout: { x: 0, y: 0, w: 4, h: 8 },
    });
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
      layout: { x: 4, y: 0, w: 8, h: 6 },
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
    await addWidget(t.ctx, travel.id, {
      name: 'Wide',
      query: SPENDING,
      layout: { x: 0, y: 0, w: 6, h: 4 },
    });
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
      layout: { x: 0, y: 4, w: 8, h: 5 },
    });
    expect((await getDashboard(t.ctx, home.id)).widgets.map((w) => w.id)).toEqual([balances.id]);
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

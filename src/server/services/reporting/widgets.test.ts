import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { listHistory } from '../history';
import {
  createWidget,
  deleteWidget,
  getWidget,
  listWidgets,
  runWidget,
  updateWidget,
  type WidgetQueryInput,
} from '.';

const t = setupTestDatabase();

const MONTH_BY_CATEGORY: WidgetQueryInput = {
  dateRange: { kind: 'last', count: 12, unit: 'month' },
  rows: 'month',
  columns: 'category',
};

describe('standalone Widgets', () => {
  it('saves a Widget with its query, filled with defaults, and records History', async () => {
    const widget = await createWidget(t.ctx, {
      name: ' Spending by Category ',
      query: MONTH_BY_CATEGORY,
    });

    expect(widget).toMatchObject({
      name: 'Spending by Category',
      visualisation: 'table',
      layout: null,
      query: {
        ...MONTH_BY_CATEGORY,
        dateRange: { kind: 'last', count: 12, unit: 'month', includeCurrent: false },
        filters: {},
        measure: 'sum',
        averagePer: 'month',
        includeCapital: false,
      },
    });
    expect(await getWidget(t.ctx, widget.id)).toEqual(widget);
    expect(await listWidgets(t.ctx)).toEqual([widget]);
    expect(await listHistory(t.ctx, { entityType: 'widget', entityId: widget.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', before: null, after: 'Spending by Category' }),
        expect.objectContaining({ field: 'visualisation', after: 'table' }),
      ]),
    );
  });

  it('refuses an invalid query', async () => {
    await expect(
      createWidget(t.ctx, { name: 'Broken', query: { ...MONTH_BY_CATEGORY, rows: 'category' } }),
    ).rejects.toThrow('Rows and columns must use different axes');
    await expect(createWidget(t.ctx, { name: ' ', query: MONTH_BY_CATEGORY })).rejects.toThrow(
      'Widget name is required',
    );
    expect(await listWidgets(t.ctx)).toEqual([]);
  });

  it('updates a Widget and records the changed fields', async () => {
    const widget = await createWidget(t.ctx, { name: 'Spending', query: MONTH_BY_CATEGORY });

    const updated = await updateWidget(t.ctx, widget.id, {
      name: 'Spending per quarter',
      query: { ...MONTH_BY_CATEGORY, rows: 'quarter' },
    });

    expect(updated.query.rows).toBe('quarter');
    const history = await listHistory(t.ctx, { entityType: 'widget', entityId: widget.id });
    expect(history.filter((entry) => entry.batchId === history[0]!.batchId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', after: 'Spending per quarter' }),
        expect.objectContaining({ field: 'query' }),
      ]),
    );
  });

  it('runs a saved Widget', async () => {
    const widget = await createWidget(t.ctx, {
      name: 'Total',
      query: { dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-01-31' } },
    });

    const report = await runWidget(t.ctx, widget.id);

    expect(report.range).toEqual({ from: '2025-01-01', to: '2025-01-31' });
    expect(report.total).toBeNull();
  });

  it('deletes a Widget', async () => {
    const widget = await createWidget(t.ctx, { name: 'Spending', query: MONTH_BY_CATEGORY });

    await deleteWidget(t.ctx, widget.id);

    expect(await listWidgets(t.ctx)).toEqual([]);
    await expect(getWidget(t.ctx, widget.id)).rejects.toThrow('Widget not found');
    await expect(getWidget(t.ctx, 'not-a-uuid')).rejects.toThrow('Widget not found');
    const history = await listHistory(t.ctx, { entityType: 'widget', entityId: widget.id });
    expect(history.filter((entry) => entry.batchId === history[0]!.batchId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', before: 'Spending', after: null }),
      ]),
    );
  });
});

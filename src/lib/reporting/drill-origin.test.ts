import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_QUERY, queryToParams } from './widget-params';
import { backLink, originFromParams, originToParams, type DrillOrigin } from './drill-origin';

const DASHBOARD = '0b6f4c1e-3a52-4d8e-9a7e-1f2d3c4b5a60';
const WIDGET = '1c7a5d2f-4b63-4e9f-8b8f-2a3e4d5c6b71';

describe('Drill-down origin', () => {
  it('round-trips a Dashboard, a Widget, the editor and Recurring payments through URL parameters', () => {
    const origins: DrillOrigin[] = [
      { kind: 'dashboard', id: DASHBOARD },
      { kind: 'widget', id: WIDGET },
      { kind: 'editor' },
      { kind: 'recurringPayment' },
    ];

    for (const origin of origins) {
      const params = Object.fromEntries(originToParams(origin));
      expect(originFromParams(params)).toEqual(origin);
    }
    expect(Object.fromEntries(originToParams({ kind: 'dashboard', id: DASHBOARD }))).toEqual({
      origin: 'dashboard',
      originId: DASHBOARD,
    });
  });

  it('never shares a parameter with the Widget query, so a fixed range keeps its dates', () => {
    const query = {
      ...DEFAULT_WIDGET_QUERY,
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
    } as const;
    const params = queryToParams(query);
    const origin = originToParams({ kind: 'widget', id: WIDGET });

    for (const name of origin.keys()) expect(params.has(name)).toBe(false);
  });

  it('falls back to the editor on an unknown type, a malformed id or a path', () => {
    for (const params of [
      {},
      { origin: 'admin', originId: DASHBOARD },
      { origin: 'dashboard', originId: 'not-a-uuid' },
      { origin: 'dashboard' },
      { origin: 'widget', originId: `${WIDGET}/../../settings` },
      { origin: 'https://example.com', originId: DASHBOARD },
    ]) {
      expect(originFromParams(params)).toEqual({ kind: 'editor' });
    }
  });

  it('links back to the Dashboard, the Widget, or the editor with its query', () => {
    expect(backLink({ kind: 'dashboard', id: DASHBOARD }, DEFAULT_WIDGET_QUERY)).toEqual({
      href: `/dashboards/${DASHBOARD}`,
      label: 'Back to the Dashboard',
    });
    expect(backLink({ kind: 'widget', id: WIDGET }, DEFAULT_WIDGET_QUERY)).toEqual({
      href: `/widgets/${WIDGET}`,
      label: 'Back to the Widget',
    });
    const editor = backLink({ kind: 'editor' }, DEFAULT_WIDGET_QUERY);
    expect(editor.label).toBe('Back to the editor');
    expect(editor.href).toBe(
      '/widgets/new?range=last&count=12&unit=month&rows=month&columns=category&measure=sum&per=month',
    );
  });

  it('links back to the Recurring payments page', () => {
    expect(backLink({ kind: 'recurringPayment' })).toEqual({
      href: '/recurring-payments',
      label: 'Back to Recurring payments',
    });
  });
});

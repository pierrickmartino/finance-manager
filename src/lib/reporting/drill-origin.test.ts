import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_QUERY } from './widget-params';
import { backLink, originFromParams, originToParams, type DrillOrigin } from './drill-origin';

const DASHBOARD = '0b6f4c1e-3a52-4d8e-9a7e-1f2d3c4b5a60';
const WIDGET = '1c7a5d2f-4b63-4e9f-8b8f-2a3e4d5c6b71';

describe('Drill-down origin', () => {
  it('round-trips a Dashboard, a Widget and the editor through URL parameters', () => {
    const origins: DrillOrigin[] = [
      { kind: 'dashboard', id: DASHBOARD },
      { kind: 'widget', id: WIDGET },
      { kind: 'editor' },
    ];

    for (const origin of origins) {
      const params = Object.fromEntries(originToParams(origin));
      expect(originFromParams(params)).toEqual(origin);
    }
    expect(Object.fromEntries(originToParams({ kind: 'dashboard', id: DASHBOARD }))).toEqual({
      from: 'dashboard',
      fromId: DASHBOARD,
    });
  });

  it('falls back to the editor on an unknown type, a malformed id or a path', () => {
    for (const params of [
      {},
      { from: 'admin', fromId: DASHBOARD },
      { from: 'dashboard', fromId: 'not-a-uuid' },
      { from: 'dashboard' },
      { from: 'widget', fromId: `${WIDGET}/../../settings` },
      { from: 'https://example.com', fromId: DASHBOARD },
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
});

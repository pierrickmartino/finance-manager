import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIOD, presetPeriod, unpinnedPage } from '@/lib/analytics/period';
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

  it('round-trips Analytics with its Period, and links back to it', () => {
    for (const preset of ['rolling-90-days', 'year-to-date', 'this-year-and-last-2'] as const) {
      const period = presetPeriod(preset);
      const origin: DrillOrigin = { kind: 'analytics', page: unpinnedPage(period) };
      const params = Object.fromEntries(originToParams(origin));
      expect(params).toEqual({ origin: 'analytics', originPeriod: preset });
      expect(originFromParams(params)).toEqual(origin);
    }
    expect(
      backLink({ kind: 'analytics', page: unpinnedPage(presetPeriod('quarter-to-date')) }),
    ).toEqual({
      href: '/analytics?period=quarter-to-date',
      label: 'Back to Analytics',
    });
  });

  it("reads a former custom Period's start date as the default Period", () => {
    expect(originFromParams({ origin: 'analytics', originFrom: '2024-03-01' })).toEqual({
      kind: 'analytics',
      page: unpinnedPage(DEFAULT_PERIOD),
    });
  });

  it('reads Analytics with a missing or unknown Period as the default one', () => {
    for (const params of [{ origin: 'analytics' }, { origin: 'analytics', originPeriod: 'week' }]) {
      expect(originFromParams(params)).toEqual({
        kind: 'analytics',
        page: unpinnedPage(DEFAULT_PERIOD),
      });
    }
  });

  it('carries every Card Period, prefixed `origin`, and links back to the page with each pin', () => {
    const origin: DrillOrigin = {
      kind: 'analytics',
      page: {
        period: presetPeriod('rolling-90-days'),
        cardPeriods: {
          'spending-by-category': 'this-year-and-last-2',
          'net-worth': 'year-to-date',
        },
      },
    };
    const params = Object.fromEntries(originToParams(origin));

    expect(params).toEqual({
      origin: 'analytics',
      originPeriod: 'rolling-90-days',
      originNetWorth: 'year-to-date',
      originSpendingByCategory: 'this-year-and-last-2',
    });
    expect(originFromParams(params)).toEqual(origin);
    expect(backLink(originFromParams(params))).toEqual({
      href: '/analytics?period=rolling-90-days&net-worth=year-to-date&spending-by-category=this-year-and-last-2',
      label: 'Back to Analytics',
    });
  });

  it('keeps pins beside a former custom Period on the way back, to the default Period', () => {
    const params = {
      origin: 'analytics',
      originFrom: '2024-03-01',
      originSpendingByCategory: 'year-to-date',
    };

    expect(backLink(originFromParams(params)).href).toBe(
      '/analytics?period=rolling-12-months&spending-by-category=year-to-date',
    );
  });

  it('drops an unknown, non-pinnable or invalid pin on the way back', () => {
    const params = {
      origin: 'analytics',
      originPeriod: 'year-to-date',
      originKeyFigures: 'rolling-30-days',
      originNetCashFlow: 'week',
      originSpendingByCategory: 'quarter-to-date',
      spendingByCategory: 'rolling-30-days',
    };

    expect(originFromParams(params)).toEqual({
      kind: 'analytics',
      page: {
        period: presetPeriod('year-to-date'),
        cardPeriods: { 'spending-by-category': 'quarter-to-date' },
      },
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  cellFromParams,
  cellToParams,
  DEFAULT_WIDGET_QUERY,
  queryFromParams,
  queryToParams,
} from './widget-params';

const ACCOUNT = '0b6f4c1e-3a52-4d8e-9a7e-1f2d3c4b5a60';
const TAG = '1c7a5d2f-4b63-4e9f-8b8f-2a3e4d5c6b71';

describe('Widget query URL parameters', () => {
  it('round-trips a full query through URL parameters', () => {
    const query = {
      filters: { accountIds: [ACCOUNT], tagIds: [TAG], categoryGroupTypes: ['expense' as const] },
      dateRange: {
        kind: 'last' as const,
        count: 6,
        unit: 'quarter' as const,
        includeCurrent: true,
      },
      rows: 'quarter' as const,
      columns: 'tag' as const,
      measure: 'average' as const,
      averagePer: 'year' as const,
      includeCapital: true,
    };

    const params = queryToParams(query);

    expect(params.toString()).toBe(
      'range=last&count=6&unit=quarter&current=1&rows=quarter&columns=tag&measure=average' +
        `&per=year&capital=1&account=${ACCOUNT}&tag=${TAG}&type=expense`,
    );
    expect(queryFromParams(Object.fromEntries(params))).toEqual({
      ...query,
      filters: { ...query.filters, accountIds: [ACCOUNT], tagIds: [TAG] },
    });
  });

  it('reads repeated filter parameters as lists and a fixed range', () => {
    const query = queryFromParams({
      range: 'fixed',
      from: '2025-01-01',
      to: '2025-03-31',
      rows: 'month',
      columns: '',
      currency: ['CHF', 'EUR'],
    });

    expect(query).toEqual({
      filters: { currencies: ['CHF', 'EUR'] },
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
      rows: 'month',
      columns: null,
      measure: 'sum',
      averagePer: 'month',
      includeCapital: false,
    });
  });

  it('uses the default query when no range is given', () => {
    expect(queryFromParams({})).toEqual(DEFAULT_WIDGET_QUERY);
    expect(queryFromParams({ range: 'yearToDate' }).dateRange).toEqual({
      kind: 'yearToDate',
      includeCurrent: false,
    });
  });

  it('encodes a drill-down cell: absent means the whole axis, none the none bucket', () => {
    expect(cellToParams({ row: '2025-01', column: null }).toString()).toBe(
      'row=2025-01&column=none',
    );
    expect(cellFromParams({ row: '2025-01', column: 'none', page: '2' })).toEqual({
      row: '2025-01',
      column: null,
      page: 2,
    });
    expect(cellFromParams({})).toEqual({ page: 1 });
  });
});

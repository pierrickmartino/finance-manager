import { describe, expect, it } from 'vitest';
import {
  balancesQueryFromParams,
  cellFromParams,
  cellToParams,
  DEFAULT_WIDGET_QUERY,
  queryFromParams,
  queryToParams,
} from './widget-params';

const ACCOUNT = '0b6f4c1e-3a52-4d8e-9a7e-1f2d3c4b5a60';
const TAG = '1c7a5d2f-4b63-4e9f-8b8f-2a3e4d5c6b71';
const BANK = '2d8b6e3a-5c74-4fa0-9c90-3b4f5e6d7c82';

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

  it('starts a new balances Widget as Net worth over the last 24 months, by month', () => {
    expect(balancesQueryFromParams({})).toEqual({
      filters: {},
      dateRange: { kind: 'last', count: 24, unit: 'month', includeCurrent: false },
      rows: 'month',
      columns: null,
      measure: 'sum',
      averagePer: 'month',
      includeCapital: false,
    });
  });

  it('reads a balances query: a time axis and a date range, or no axis as today', () => {
    expect(
      balancesQueryFromParams({ range: 'yearToDate', rows: 'quarter', columns: 'category' }),
    ).toMatchObject({
      dateRange: { kind: 'yearToDate', includeCurrent: false },
      rows: 'quarter',
      columns: null,
    });
    // An existing balances Widget (rows by Account), or "None" in the editor.
    for (const rows of ['account', '']) {
      expect(
        balancesQueryFromParams({ range: 'last', count: '12', unit: 'month', rows }),
      ).toMatchObject({
        rows: 'account',
        columns: null,
      });
    }
  });

  it('reads only the Account, Bank and Account kind filters of a balances query', () => {
    const query = balancesQueryFromParams({
      range: 'last',
      count: '24',
      unit: 'month',
      rows: 'month',
      account: ACCOUNT,
      bank: BANK,
      kind: ['savings', '3a'],
      tag: TAG,
      type: 'capital',
      currency: 'EUR',
      capital: '1',
    });

    expect(query.filters).toEqual({
      accountIds: [ACCOUNT],
      bankIds: [BANK],
      accountKinds: ['savings', '3a'],
    });
    expect(query.includeCapital).toBe(false);
  });

  it('round-trips the Bank and Account kind filters through URL parameters', () => {
    const query = {
      dateRange: { kind: 'yearToDate' as const, includeCurrent: false },
      rows: 'month' as const,
      filters: { bankIds: [BANK], accountKinds: ['loan' as const] },
    };

    const params = queryToParams(query);

    expect(params.getAll('bank')).toEqual([BANK]);
    expect(params.getAll('kind')).toEqual(['loan']);
    expect(balancesQueryFromParams(Object.fromEntries(params)).filters).toEqual(query.filters);
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

  it('round-trips "every key but these" and a change through URL parameters', () => {
    const cell = {
      row: { except: ['2025-03'] },
      column: { except: [TAG, null] },
      withPeriodSubtotals: true,
    };

    const params = cellToParams(cell);

    expect(params.toString()).toBe(`rowNot=2025-03&columnNot=${TAG}&columnNot=none&subtotals=1`);
    expect(cellFromParams(Object.fromEntries(group(params)))).toEqual({ ...cell, page: 1 });
  });

  it('reads "every key but none" as every key, the whole axis', () => {
    expect(cellToParams({ row: { except: [] } }).toString()).toBe('');
  });
});

/** URL parameters as Next.js passes them: a repeated name as an array. */
function group(params: URLSearchParams): [string, string | string[]][] {
  return [...new Set(params.keys())].map((name) => {
    const values = params.getAll(name);
    return [name, values.length === 1 ? values[0]! : values];
  });
}

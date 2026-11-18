import { describe, expect, it } from 'vitest';
import type { ReportTable } from '@/server/services/reporting';
import { DEFAULT_NET_WORTH_QUERY } from '@/lib/reporting/widget-params';
import { toPivotData } from './pivot-data';

/** Net worth over Q1 2025 with one capital movement, its Accounts filtered by `filters`. */
function netWorthReport(filters: ReportTable['query']['filters']): ReportTable {
  return {
    query: { ...DEFAULT_NET_WORTH_QUERY, filters },
    range: { from: '2025-01-01', to: '2025-03-31' },
    partialPeriod: null,
    rows: [{ key: '2025-03', label: 'Mar 2025', isPartial: false }],
    columns: [{ key: 'current', label: 'Current', isPartial: false }],
    cells: [[100_00]],
    rowTotals: [100_00],
    columnTotals: [100_00],
    total: 100_00,
    unconvertedCount: 0,
    markers: [
      {
        transactionId: 'tx1',
        lineId: null,
        date: '2025-02-10',
        amountMinor: 50_00,
        label: 'Inheritance',
      },
    ],
  };
}

const links = { hrefOf: () => '/accounts', drill: null };

describe('toPivotData: Capital movements', () => {
  it('opens each marker on its Transaction detail', () => {
    const data = toPivotData(netWorthReport({}), links);

    expect(data.capital?.markers).toEqual([
      expect.objectContaining({ transactionId: 'tx1', href: '/transactions/tx1' }),
    ]);
  });

  it('lists the Capital Transactions of the range', () => {
    const data = toPivotData(netWorthReport({}), links);

    expect(data.capital?.href).toBe(
      '/transactions?from=2025-01-01&to=2025-03-31&groupType=capital',
    );
  });

  it('narrows the list to the one Account the Widget counts', () => {
    const data = toPivotData(netWorthReport({ accountIds: ['a1'] }), links);

    expect(data.capital?.href).toBe(
      '/transactions?from=2025-01-01&to=2025-03-31&accountId=a1&groupType=capital',
    );
  });

  it('leaves the Account out when the list cannot narrow to the Widget’s Accounts', () => {
    // The list filters by one Account at most, and by no Bank or account kind.
    const many = toPivotData(netWorthReport({ accountIds: ['a1', 'a2'] }), links);
    const byKind = toPivotData(netWorthReport({ accountKinds: ['savings'] }), links);

    expect(many.capital?.href).toBe(
      '/transactions?from=2025-01-01&to=2025-03-31&groupType=capital',
    );
    expect(byKind.capital?.href).toBe(
      '/transactions?from=2025-01-01&to=2025-03-31&groupType=capital',
    );
  });

  it('has no Capital movements for a report without markers', () => {
    const { markers: _, ...report } = netWorthReport({});

    expect(toPivotData(report, links).capital).toBeUndefined();
  });
});

import { describe, expect, test } from 'vitest';
import {
  accountKindOf,
  accountsHref,
  balanceDates,
  filterByKind,
  groupByBank,
  selectAccount,
  totalChfMinor,
  type BalanceRow,
} from './view';

function row(
  id: string,
  extra: Partial<BalanceRow['account']> = {},
  chf: number | null = 100,
): BalanceRow {
  return {
    account: { id, bankName: 'UBS', archivedAt: null, ...extra },
    chf: chf === null ? null : { amountMinor: chf },
  };
}

describe('accountsHref', () => {
  test('is the bare path with nothing selected and no date', () => {
    expect(accountsHref({})).toBe('/accounts');
  });

  test('keeps the selected Account and the date', () => {
    expect(accountsHref({ account: 'a1', date: '2026-03-31' })).toBe(
      '/accounts?account=a1&date=2026-03-31',
    );
    expect(accountsHref({ account: 'new' })).toBe('/accounts?account=new');
  });

  test('keeps the Account kind it is narrowed to', () => {
    expect(accountsHref({ date: '2025-02-28', kind: 'loan' })).toBe(
      '/accounts?date=2025-02-28&kind=loan',
    );
    expect(accountsHref({ account: 'a1', kind: '3a' })).toBe('/accounts?account=a1&kind=3a');
  });
});

describe('accountKindOf', () => {
  test('reads a known Account kind from the URL', () => {
    expect(accountKindOf('savings')).toBe('savings');
    expect(accountKindOf('3a')).toBe('3a');
  });

  test('is null for no kind or one it does not know', () => {
    expect(accountKindOf(undefined)).toBeNull();
    expect(accountKindOf('')).toBeNull();
    expect(accountKindOf('shares')).toBeNull();
  });
});

describe('filterByKind', () => {
  const rows = [
    { account: { id: 'a1', kind: 'current' as const } },
    { account: { id: 'a2', kind: 'loan' as const } },
    { account: { id: 'a3', kind: 'current' as const } },
  ];

  test('keeps only the Accounts of the kind', () => {
    expect(filterByKind(rows, 'current').map((r) => r.account.id)).toEqual(['a1', 'a3']);
    expect(filterByKind(rows, 'savings')).toEqual([]);
  });

  test('keeps every Account with no kind', () => {
    expect(filterByKind(rows, null)).toEqual(rows);
  });
});

describe('selectAccount', () => {
  const rows = [row('a1'), row('a2')];

  test('picks the Account the URL names', () => {
    expect(selectAccount(rows, 'a2')).toEqual({ type: 'account', row: rows[1] });
  });

  test('falls back to the first Account on a missing or unknown id', () => {
    expect(selectAccount(rows, undefined)).toEqual({ type: 'account', row: rows[0] });
    expect(selectAccount(rows, 'gone')).toEqual({ type: 'account', row: rows[0] });
  });

  test('shows the New Account form when asked, or when there are no Accounts', () => {
    expect(selectAccount(rows, 'new')).toEqual({ type: 'new' });
    expect(selectAccount([], undefined)).toEqual({ type: 'new' });
  });
});

describe('groupByBank', () => {
  test('groups by Bank in listing order', () => {
    const rows = [
      row('a1', { bankName: 'UBS' }),
      row('a2', { bankName: 'BCGE' }),
      row('a3', { bankName: 'UBS' }),
    ];
    expect(groupByBank(rows)).toEqual([
      { bankName: 'UBS', rows: [rows[0], rows[2]] },
      { bankName: 'BCGE', rows: [rows[1]] },
    ]);
  });
});

describe('totalChfMinor', () => {
  test('sums active Accounts and counts those without an FX rate', () => {
    const rows = [
      row('a1', {}, 1_000),
      row('a2', {}, -400),
      row('a3', {}, null),
      row('a4', { archivedAt: new Date('2026-01-01') }, 5_000),
    ];
    expect(totalChfMinor(rows)).toEqual({ amountMinor: 600, missingRates: 1 });
  });
});

describe('balanceDates', () => {
  test('are the end of the previous year, then 90 and 30 days back', () => {
    expect(balanceDates('2026-03-15')).toEqual([
      { label: 'End of last year', date: '2025-12-31' },
      { label: '90 days earlier', date: '2025-12-15' },
      { label: '30 days earlier', date: '2026-02-13' },
    ]);
  });
});

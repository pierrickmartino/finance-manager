import { describe, expect, test } from 'vitest';
import { banksHref, selectBank, summarizeBanks, type BankBalanceRow } from './view';

function row(
  id: string,
  bankId: string,
  extra: Partial<BankBalanceRow['account']> = {},
  { balanceMinor = 100, chf = 100 as number | null } = {},
): BankBalanceRow {
  return {
    account: { id, bankId, bankName: bankId, currency: 'CHF', archivedAt: null, ...extra },
    balanceMinor,
    chf: chf === null ? null : { amountMinor: chf },
  };
}

const ubs = { id: 'ubs', name: 'UBS' };
const cler = { id: 'cler', name: 'Cler' };

describe('banksHref', () => {
  test('is the bare path with nothing selected', () => {
    expect(banksHref()).toBe('/banks');
  });

  test('names the selected Bank or the New Bank form', () => {
    expect(banksHref('b1')).toBe('/banks?bank=b1');
    expect(banksHref('new')).toBe('/banks?bank=new');
  });
});

describe('summarizeBanks', () => {
  test('keeps every Bank in order, with no Accounts when it has none', () => {
    const [first, second] = summarizeBanks([cler, ubs], []);

    expect(first).toMatchObject({ bank: cler, accounts: [], activeCount: 0, chfMinor: 0 });
    expect(second).toMatchObject({ bank: ubs, byCurrency: [] });
  });

  test('gives each Bank its own Accounts and their CHF total', () => {
    const rows = [row('a1', 'ubs', {}, { chf: 300 }), row('a2', 'cler'), row('a3', 'ubs')];

    const [summary] = summarizeBanks([ubs], rows);

    expect(summary!.accounts).toEqual([rows[0], rows[2]]);
    expect(summary!.activeCount).toBe(2);
    expect(summary!.chfMinor).toBe(400);
  });

  test('nets loans against the other Accounts', () => {
    const rows = [
      row('a1', 'ubs', {}, { balanceMinor: 500, chf: 500 }),
      row('loan', 'ubs', {}, { balanceMinor: -2000, chf: -2000 }),
    ];

    expect(summarizeBanks([ubs], rows)[0]!.chfMinor).toBe(-1500);
  });

  test('lists archived Accounts but leaves them out of every total', () => {
    const archived = row('old', 'ubs', { archivedAt: new Date() }, { balanceMinor: 900, chf: 900 });

    const [summary] = summarizeBanks([ubs], [row('a1', 'ubs'), archived]);

    expect(summary!.accounts).toHaveLength(2);
    expect(summary!.activeCount).toBe(1);
    expect(summary!.chfMinor).toBe(100);
    expect(summary!.byCurrency).toEqual([{ currency: 'CHF', amountMinor: 100 }]);
  });

  test('counts Accounts without an FX rate instead of summing them', () => {
    const usd = row('usd', 'ubs', { currency: 'USD' }, { balanceMinor: 700, chf: null });

    const [summary] = summarizeBanks([ubs], [row('a1', 'ubs'), usd]);

    expect(summary!.chfMinor).toBe(100);
    expect(summary!.missingRates).toBe(1);
  });

  test('totals each Currency in its own minor units, in first-seen order', () => {
    const rows = [
      row('e1', 'ubs', { currency: 'EUR' }, { balanceMinor: 250 }),
      row('c1', 'ubs', {}, { balanceMinor: 100 }),
      row('e2', 'ubs', { currency: 'EUR' }, { balanceMinor: 50 }),
    ];

    expect(summarizeBanks([ubs], rows)[0]!.byCurrency).toEqual([
      { currency: 'EUR', amountMinor: 300 },
      { currency: 'CHF', amountMinor: 100 },
    ]);
  });
});

describe('selectBank', () => {
  const summaries = summarizeBanks([cler, ubs], []);

  test('picks the Bank the URL names', () => {
    expect(selectBank(summaries, 'ubs')).toEqual({ type: 'bank', summary: summaries[1] });
  });

  test('falls back to the first Bank on a missing or unknown id', () => {
    expect(selectBank(summaries, undefined)).toEqual({ type: 'bank', summary: summaries[0] });
    expect(selectBank(summaries, 'gone')).toEqual({ type: 'bank', summary: summaries[0] });
  });

  test('shows the New Bank form when asked, or when there is no Bank yet', () => {
    expect(selectBank(summaries, 'new')).toEqual({ type: 'new' });
    expect(selectBank([], 'ubs')).toEqual({ type: 'new' });
  });
});

import { describe, expect, test } from 'vitest';
import { groupFacts, selectedGroupKey, unclassifiedHref, type FactsTransaction } from './view';

function transaction(extra: Partial<FactsTransaction> = {}): FactsTransaction {
  return {
    bookingDate: '2026-03-01',
    amountMinor: -500,
    currency: 'CHF',
    counterpartyName: null,
    ...extra,
  };
}

describe('unclassifiedHref', () => {
  test('is the bare path on the first page with no group', () => {
    expect(unclassifiedHref({})).toBe('/unclassified');
    expect(unclassifiedHref({ page: 1 })).toBe('/unclassified');
  });

  test('keeps the page and encodes the group key', () => {
    expect(unclassifiedHref({ page: 2, group: 'twint *cafe & co' })).toBe(
      '/unclassified?page=2&group=twint+*cafe+%26+co',
    );
  });

  test('keeps an empty group key (the group of blank descriptions)', () => {
    expect(unclassifiedHref({ group: '' })).toBe('/unclassified?group=');
  });
});

describe('selectedGroupKey', () => {
  const groups = [{ key: 'migros' }, { key: 'sbb' }];

  test('is the group the URL names, even when this page does not list it', () => {
    expect(selectedGroupKey(groups, 'sbb')).toBe('sbb');
    expect(selectedGroupKey(groups, 'coop')).toBe('coop');
    expect(selectedGroupKey(groups, '')).toBe('');
  });

  test('falls back to the largest group listed', () => {
    expect(selectedGroupKey(groups, undefined)).toBe('migros');
  });

  test('is undefined when nothing is left', () => {
    expect(selectedGroupKey([], undefined)).toBeUndefined();
  });
});

describe('groupFacts', () => {
  test('sums amounts per currency, in order of first appearance', () => {
    const facts = groupFacts([
      transaction({ amountMinor: -500 }),
      transaction({ amountMinor: -1200, currency: 'EUR' }),
      transaction({ amountMinor: -250 }),
    ]);
    expect(facts.totals).toEqual([
      { currency: 'CHF', amountMinor: -750 },
      { currency: 'EUR', amountMinor: -1200 },
    ]);
  });

  test('spans the oldest to the newest booking date', () => {
    const facts = groupFacts([
      transaction({ bookingDate: '2026-05-02' }),
      transaction({ bookingDate: '2026-01-15' }),
      transaction({ bookingDate: '2026-03-09' }),
    ]);
    expect(facts.firstDate).toBe('2026-01-15');
    expect(facts.lastDate).toBe('2026-05-02');
  });

  test('lists counterparties most frequent first, skipping blanks', () => {
    const facts = groupFacts([
      transaction({ counterpartyName: 'Coop' }),
      transaction({ counterpartyName: 'Migros' }),
      transaction({ counterpartyName: null }),
      transaction({ counterpartyName: 'Migros' }),
    ]);
    expect(facts.counterparties).toEqual(['Migros', 'Coop']);
  });

  test('is empty for no Transactions', () => {
    expect(groupFacts([])).toEqual({
      totals: [],
      firstDate: undefined,
      lastDate: undefined,
      counterparties: [],
    });
  });
});

import { describe, expect, test } from 'vitest';
import {
  bulkFilterOf,
  pickSelected,
  readTransactionSearch,
  SEARCH_FIELDS,
  transactionsHref,
  type SearchValues,
} from './search';

const BLANK = Object.fromEntries(SEARCH_FIELDS.map((field) => [field, ''])) as SearchValues;

describe('readTransactionSearch', () => {
  test('reads the previewed Transaction id from `selected`', () => {
    const search = readTransactionSearch({ selected: ' abc ' }, 'apostrophe');

    expect(search.selected).toBe('abc');
  });

  test('reads no previewed Transaction when `selected` is absent or repeated', () => {
    expect(readTransactionSearch({}, 'apostrophe').selected).toBe('');
    expect(readTransactionSearch({ selected: ['a', 'b'] }, 'apostrophe').selected).toBe('');
  });

  test('keeps `selected` out of the service query', () => {
    const search = readTransactionSearch({ selected: 'abc', text: 'coop' }, 'apostrophe');

    expect(search.query).not.toHaveProperty('selected');
    expect(search.query?.text).toBe('coop');
  });
});

describe('transactionsHref', () => {
  test('keeps the filters and page and adds the previewed Transaction', () => {
    const href = transactionsHref({ ...BLANK, text: 'coop' }, 3, 'abc');

    expect(href).toBe('/transactions?text=coop&page=3&selected=abc');
  });

  test('leaves `selected` out when nothing is previewed', () => {
    expect(transactionsHref(BLANK)).toBe('/transactions');
    expect(transactionsHref(BLANK, 2)).toBe('/transactions?page=2');
  });
});

describe('pickSelected', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];

  test('returns the row with the selected id', () => {
    expect(pickSelected(rows, 'b')).toEqual({ id: 'b' });
  });

  test('falls back to the first row when the id is blank or not on this page', () => {
    expect(pickSelected(rows, '')).toEqual({ id: 'a' });
    expect(pickSelected(rows, 'gone')).toEqual({ id: 'a' });
  });

  test('returns null for an empty page', () => {
    expect(pickSelected([], 'a')).toBeNull();
  });
});

describe('bulkFilterOf', () => {
  test("drops the page and page size, keeping every filter of the list's query", () => {
    const filter = bulkFilterOf({
      text: 'coop',
      accountId: 'account-1',
      amountMin: -10_000,
      status: 'manual',
      page: 3,
      pageSize: 50,
    });

    expect(filter).toEqual({
      text: 'coop',
      accountId: 'account-1',
      amountMin: -10_000,
      status: 'manual',
    });
  });

  test('gives an empty filter for a query that is only a page', () => {
    expect(bulkFilterOf({ page: 2 })).toEqual({});
  });
});

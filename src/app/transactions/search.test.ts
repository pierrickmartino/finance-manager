import { describe, expect, test } from 'vitest';
import {
  bulkFilterOf,
  pickSelected,
  readDetailList,
  readTransactionSearch,
  SEARCH_FIELDS,
  transactionDetailHref,
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

describe('transactionDetailHref', () => {
  test("carries the list's filters and the list marker, dropping blanks", () => {
    const href = transactionDetailHref('abc', { ...BLANK, text: 'coop', unclassified: 'true' });

    expect(href).toBe('/transactions/abc?list=1&text=coop&unclassified=true');
  });

  test('marks the unfiltered list, so it differs from a bare link', () => {
    expect(transactionDetailHref('abc', BLANK)).toBe('/transactions/abc?list=1');
  });
});

describe('readDetailList', () => {
  test('reads no list from a bare detail URL', () => {
    expect(readDetailList({}, 'apostrophe')).toBeNull();
    expect(readDetailList({ text: 'coop' }, 'apostrophe')).toBeNull();
  });

  test('reads the filters of the list the detail was opened from', () => {
    const search = readDetailList({ list: '1', text: 'coop', accountId: '' }, 'apostrophe');

    expect(search?.values).toEqual({ ...BLANK, text: 'coop' });
    expect(search?.query?.text).toBe('coop');
  });

  test('reads the unfiltered list from the marker alone', () => {
    expect(readDetailList({ list: '1' }, 'apostrophe')?.values).toEqual(BLANK);
  });

  test('ignores a page or selection in the detail URL', () => {
    const search = readDetailList({ list: '1', page: '3', selected: 'x' }, 'apostrophe');

    expect([search?.page, search?.selected, search?.query?.page]).toEqual([1, '', 1]);
  });

  test('round-trips the filters of a detail URL it built', () => {
    const values = { ...BLANK, from: '2025-10-01', amountMin: '-50.00', transfer: 'exclude' };
    const params = Object.fromEntries(
      new URL(transactionDetailHref('abc', values), 'http://x').searchParams,
    );

    expect(readDetailList(params, 'apostrophe')?.values).toEqual(values);
  });
});

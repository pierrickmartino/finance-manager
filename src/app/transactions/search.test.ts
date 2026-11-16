import { describe, expect, test } from 'vitest';
import {
  bulkFilterOf,
  pickSelected,
  readDetailList,
  readTransactionSearch,
  SEARCH_FIELDS,
  transactionDetailHref,
  transactionsAfterDeleteHref,
  transactionsBackHref,
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

  test('encodes the filters as URL parameters', () => {
    expect(transactionDetailHref('abc', { ...BLANK, text: 'Bread & butter' })).toBe(
      '/transactions/abc?list=1&text=Bread+%26+butter',
    );
  });

  test('is the bare detail without a list', () => {
    expect(transactionDetailHref('abc', null)).toBe('/transactions/abc');
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

/** The 70th of 120 matching Transactions, at 50 per page: on page 2. */
const PLACE = {
  matches: true,
  position: 70,
  total: 120,
  previousId: 'newer',
  nextId: 'older',
  page: 2,
  pageSize: 50,
};

describe('transactionsBackHref', () => {
  test('returns to the list page holding the Transaction, with it selected and the filters kept', () => {
    const values = { ...BLANK, accountId: 'acc', unclassified: 'true' };

    expect(transactionsBackHref(values, PLACE, 'abc')).toBe(
      '/transactions?accountId=acc&unclassified=true&page=2&selected=abc',
    );
  });

  test('leaves the first page out of the URL', () => {
    expect(transactionsBackHref(BLANK, { ...PLACE, page: 1 }, 'abc')).toBe(
      '/transactions?selected=abc',
    );
  });

  test('goes to the bare list when the detail has no list', () => {
    expect(transactionsBackHref(null, null, 'abc')).toBe('/transactions');
  });

  test("keeps the filters, on the first page, when the Transaction's place is unknown", () => {
    expect(transactionsBackHref({ ...BLANK, amountMin: 'lots' }, null, 'abc')).toBe(
      '/transactions?amountMin=lots',
    );
  });

  test('round-trips through the list reader', () => {
    const values = { ...BLANK, from: '2025-10-01', text: 'coop' };
    const params = Object.fromEntries(
      new URL(transactionsBackHref(values, { ...PLACE, page: 3 }, 'abc'), 'http://x').searchParams,
    );
    const search = readTransactionSearch(params, 'apostrophe');

    expect([search.values, search.page, search.selected]).toEqual([values, 3, 'abc']);
  });

  test('from a Transaction that no longer matches, selects its next neighbour on its page', () => {
    // It would be the 70th: the next one is the 70th now, on the same page.
    const place = { ...PLACE, matches: false, position: null, total: 119 };

    expect(transactionsBackHref(BLANK, place, 'abc')).toBe('/transactions?page=2&selected=older');
  });

  test('from a Transaction that no longer matches after the last one, selects the previous one on its page', () => {
    // 100 still match, all newer: it would sit on page 3, the 100th is on page 2.
    const place = { ...PLACE, matches: false, position: null, total: 100, nextId: null, page: 3 };

    expect(transactionsBackHref(BLANK, place, 'abc')).toBe('/transactions?page=2&selected=newer');
  });

  test('from a Transaction that no longer matches an empty list, opens its first page with nothing selected', () => {
    const values = { ...BLANK, unclassified: 'true' };
    const place = {
      ...PLACE,
      matches: false,
      position: null,
      total: 0,
      previousId: null,
      nextId: null,
      page: 1,
    };

    expect(transactionsBackHref(values, place, 'abc')).toBe('/transactions?unclassified=true');
  });
});

describe('transactionsAfterDeleteHref', () => {
  test("selects the deleted Transaction's next neighbour, which takes its place on its page", () => {
    expect(transactionsAfterDeleteHref(BLANK, { ...PLACE, position: 50, page: 1 })).toBe(
      '/transactions?selected=older',
    );
  });

  test('selects the previous one after deleting the last, on the page it is on now', () => {
    // The 101st of 101 deleted: the 100th is on page 2, not page 3.
    const place = { ...PLACE, position: 101, total: 101, nextId: null, page: 3 };

    expect(transactionsAfterDeleteHref(BLANK, place)).toBe('/transactions?page=2&selected=newer');
  });

  test('opens the filtered list with nothing selected once its only Transaction is deleted', () => {
    const values = { ...BLANK, accountId: 'acc' };
    const place = { ...PLACE, position: 1, total: 1, previousId: null, nextId: null, page: 1 };

    expect(transactionsAfterDeleteHref(values, place)).toBe('/transactions?accountId=acc');
  });

  test('goes to the bare list without a list, and to its first page without a place', () => {
    expect(transactionsAfterDeleteHref(null, null)).toBe('/transactions');
    expect(transactionsAfterDeleteHref({ ...BLANK, text: 'coop' }, null)).toBe(
      '/transactions?text=coop',
    );
  });
});

/**
 * The Transactions list's URL: its search fields (a GET form), as the list reads them
 * (`src/app/transactions/search.ts`) and as any link to it from elsewhere sets them.
 */

export const SEARCH_FIELDS = [
  'from',
  'to',
  'accountId',
  'amountMin',
  'amountMax',
  'text',
  'status',
  'payeeId',
  'categoryId',
  'tagId',
  'groupType',
  'unclassified',
  'transfer',
  'fxRate',
] as const;

export type SearchValues = Record<(typeof SEARCH_FIELDS)[number], string>;

/** Search values with only `values` set, every other field blank. */
export function searchValues(values: Partial<SearchValues>): SearchValues {
  const blank = Object.fromEntries(SEARCH_FIELDS.map((field) => [field, ''])) as SearchValues;
  return { ...blank, ...values };
}

/** `path` with `query` as its query string, if it has any parameter. */
export function withQuery(path: string, query: URLSearchParams): string {
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** The non-blank search values as URL parameters, after any `leading` ones. */
export function filterParams(
  values: SearchValues,
  leading: [string, string][] = [],
): URLSearchParams {
  return new URLSearchParams([...leading, ...Object.entries(values).filter(([, value]) => value)]);
}

/** The list URL for these search values on a given page, optionally previewing a Transaction. */
export function transactionsHref(values: SearchValues, page = 1, selected = ''): string {
  const query = filterParams(values);
  if (page > 1) query.set('page', String(page));
  if (selected) query.set('selected', selected);
  return withQuery('/transactions', query);
}

import type { NumberFormat } from '@/lib/format';
import { parseAmount } from '@/lib/format/parse-amount';
import type { TransactionQuery } from '@/server/services/transactions';
import type { BulkFilter } from '@/server/services/transactions/bulk-edit';

/**
 * The Transaction list's URL parameters (a GET form), as the form shows them and as the
 * service query.
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

export interface TransactionSearch {
  values: SearchValues;
  page: number;
  /** The Transaction shown in the preview pane (`?selected=`); blank for the page's first. */
  selected: string;
  /** The service query, or null when a field can't be read (see `error`). */
  query: TransactionQuery | null;
  error: string | null;
}

type Params = Record<string, string | string[] | undefined>;

function readPage(value: string | string[] | undefined): number {
  const page = typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/**
 * Reads the list's URL parameters. Amounts are typed in the user's number format and read
 * as minor units with two decimals (CHF and EUR); the service validates everything else.
 */
export function readTransactionSearch(
  params: Params,
  numberFormat: NumberFormat,
): TransactionSearch {
  const values = Object.fromEntries(
    SEARCH_FIELDS.map((field) => {
      const value = params[field];
      return [field, typeof value === 'string' ? value.trim() : ''];
    }),
  ) as SearchValues;
  const page = readPage(params.page);
  const selected = typeof params.selected === 'string' ? params.selected.trim() : '';

  const amountMin = values.amountMin ? parseAmount(values.amountMin, numberFormat) : undefined;
  const amountMax = values.amountMax ? parseAmount(values.amountMax, numberFormat) : undefined;
  const invalid = (amountMin === null && 'Minimum') || (amountMax === null && 'Maximum');
  if (invalid) {
    return { values, page, selected, query: null, error: `${invalid} amount must be an amount` };
  }

  const query: TransactionQuery = {
    from: values.from,
    to: values.to,
    accountId: values.accountId,
    text: values.text,
    status: values.status,
    payeeId: values.payeeId,
    categoryId: values.categoryId,
    tagId: values.tagId,
    groupType: values.groupType,
    unclassified: values.unclassified === 'true' ? true : undefined,
    transfer: values.transfer,
    fxRate: values.fxRate,
    amountMin: amountMin ?? undefined,
    amountMax: amountMax ?? undefined,
    page,
  };
  return { values, page, selected, query, error: null };
}

/**
 * `path` with the non-blank search values (and the page, after the first, and the previewed
 * Transaction, if any) as its query.
 */
function withSearch(path: string, values: SearchValues, page = 1, selected = ''): string {
  const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
  if (page > 1) query.set('page', String(page));
  if (selected) query.set('selected', selected);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** The list URL for these search values on a given page, optionally previewing a Transaction. */
export function transactionsHref(values: SearchValues, page = 1, selected = ''): string {
  return withSearch('/transactions', values, page, selected);
}

/**
 * "← Transactions" from the Transaction detail of `id` (ADR-0013): the list it was opened from
 * (`values`, null for a bare detail), at the page holding the Transaction (`place`, from
 * `locateTransaction`), with it selected. With a list but no known place (its filters don't
 * read), the list's first page.
 */
export function transactionsBackHref(
  values: SearchValues | null,
  place: { page: number } | null,
  id: string,
): string {
  if (!values) return '/transactions';
  if (!place) return transactionsHref(values);
  return transactionsHref(values, place.page, id);
}

/**
 * The marker of a Transaction detail URL built by a Transactions list link (ADR-0013): it
 * tells the unfiltered list from a bare link, which shows no Previous and Next.
 */
export const DETAIL_LIST_MARKER = 'list';

/**
 * The Transaction detail of `id` within the list of these search values: the marker, then the
 * non-blank filters. The list's page and selection are left out; the detail derives them.
 */
export function transactionDetailHref(id: string, values: SearchValues): string {
  const filters = withSearch('', values).replace(/^\?/, '&');
  return `/transactions/${id}?${DETAIL_LIST_MARKER}=1${filters}`;
}

/**
 * The list a Transaction detail was opened from, read from its URL as the list reads its own,
 * without a page or selection; null for a bare detail URL.
 */
export function readDetailList(
  params: Params,
  numberFormat: NumberFormat,
): TransactionSearch | null {
  if (params[DETAIL_LIST_MARKER] === undefined) return null;
  const { page: _page, selected: _selected, ...filters } = params;
  return readTransactionSearch(filters, numberFormat);
}

/**
 * The row the preview pane shows: the selected one when it is on this page, else the first.
 * Only rows already on the page qualify, so an id in the URL never loads anything by itself.
 */
export function pickSelected<T extends { id: string }>(rows: T[], selected: string): T | null {
  return rows.find((row) => row.id === selected) ?? rows[0] ?? null;
}

/** The CSV export URL for these search values: the same filters, every page. */
export function transactionsExportHref(values: SearchValues): string {
  return withSearch('/api/transactions/export', values);
}

/** The list's query without its page: the filter "Select all N matching this filter" edits. */
export function bulkFilterOf(query: TransactionQuery): BulkFilter {
  const { page: _page, pageSize: _pageSize, ...filter } = query;
  return filter;
}

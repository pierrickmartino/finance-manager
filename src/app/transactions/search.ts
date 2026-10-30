import type { NumberFormat } from '@/lib/format';
import { parseAmount } from '@/lib/format/parse-amount';
import type { TransactionQuery } from '@/server/services/transactions';

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
] as const;

export type SearchValues = Record<(typeof SEARCH_FIELDS)[number], string>;

export interface TransactionSearch {
  values: SearchValues;
  page: number;
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

  const amountMin = values.amountMin ? parseAmount(values.amountMin, numberFormat) : undefined;
  const amountMax = values.amountMax ? parseAmount(values.amountMax, numberFormat) : undefined;
  const invalid = (amountMin === null && 'Minimum') || (amountMax === null && 'Maximum');
  if (invalid) {
    return { values, page, query: null, error: `${invalid} amount must be an amount` };
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
    amountMin: amountMin ?? undefined,
    amountMax: amountMax ?? undefined,
    page,
  };
  return { values, page, query, error: null };
}

/** The list URL for these search values on a given page. */
export function transactionsHref(values: SearchValues, page = 1): string {
  const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `/transactions?${search}` : '/transactions';
}

/**
 * A Transactions list link from outside the list: its booking dates, and only the Unclassified
 * ones (no Category and no Transfer) when asked. The parameters are the list's own search fields
 * (`src/app/transactions/search.ts`).
 */
export function transactionListHref(params: {
  from?: string;
  to?: string;
  unclassified?: boolean;
}): string {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.unclassified) search.set('unclassified', 'true');
  const query = search.toString();
  return query ? `/transactions?${query}` : '/transactions';
}

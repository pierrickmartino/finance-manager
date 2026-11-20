import type { AccountKind } from '@/server/services/accounts/input';

/**
 * An Accounts page link: the selected Account (or the New Account form), the date and the
 * account kind the list is narrowed to.
 */
export function accountsHref(params: {
  account?: string;
  date?: string;
  kind?: AccountKind;
}): string {
  const search = new URLSearchParams();
  if (params.account) search.set('account', params.account);
  if (params.date) search.set('date', params.date);
  if (params.kind) search.set('kind', params.kind);
  const query = search.toString();
  return query ? `/accounts?${query}` : '/accounts';
}

import type { Payee } from '@/server/services/payees';

export interface InitialSection {
  /** A-Z, or "#" for a name that doesn't start with a letter. */
  initial: string;
  payees: Payee[];
}

/** Lower case, accents removed, so "Café" matches "cafe". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The Payees whose name contains the query (ignoring case and accents); all for a blank one. */
export function filterPayees(payees: Payee[], query: string): Payee[] {
  const needle = fold(query.trim());
  return needle ? payees.filter((payee) => fold(payee.name).includes(needle)) : payees;
}

/**
 * The Payee shown in the detail pane: the one the URL names (even when the filter hides it),
 * else the first one the list shows.
 */
export function selectPayee(
  payees: Payee[],
  visible: Payee[],
  payeeId: string | undefined,
): Payee | undefined {
  return payees.find((payee) => payee.id === payeeId) ?? visible[0];
}

function initialOf(name: string): string {
  const first = fold(name.trim()).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/**
 * Payees sectioned by first letter ("#" first, then A-Z), each section keeping the Payees'
 * order. An accented initial joins its letter wherever the database sorted it.
 */
export function payeesByInitial(payees: Payee[]): InitialSection[] {
  const initials = [...new Set(payees.map((payee) => initialOf(payee.name)))].sort();
  return initials.map((initial) => ({
    initial,
    payees: payees.filter((payee) => initialOf(payee.name) === initial),
  }));
}

/** The Payees page with this Payee open, keeping the list's filter. */
export function payeeHref(payeeId: string, query: string): string {
  const params = new URLSearchParams({ payee: payeeId });
  if (query) params.set('q', query);
  return `/payees?${params.toString()}`;
}

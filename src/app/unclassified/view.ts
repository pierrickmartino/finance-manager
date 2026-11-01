/** Pure helpers for the Unclassified page: its links, the selected group and its key facts. */

/** An Unclassified page link: the page of groups and the selected group, if any. */
export function unclassifiedHref(params: { page?: number; group?: string }): string {
  const search = new URLSearchParams();
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.group !== undefined) search.set('group', params.group);
  const query = search.toString();
  return query ? `/unclassified?${query}` : '/unclassified';
}

/**
 * The group shown in the detail pane: the one the URL names (even if this page of the list
 * does not show it, or it has just been emptied), else the largest group listed.
 */
export function selectedGroupKey(
  groups: readonly { key: string }[],
  groupParam: string | undefined,
): string | undefined {
  return groupParam ?? groups[0]?.key;
}

/** The fields of a Transaction the group's key facts read. */
export interface FactsTransaction {
  bookingDate: string;
  amountMinor: number;
  currency: string;
  counterpartyName: string | null;
}

export interface GroupFacts {
  /** Sum of the amounts per Currency, in order of first appearance. */
  totals: { currency: string; amountMinor: number }[];
  firstDate: string | undefined;
  lastDate: string | undefined;
  /** Distinct counterparty names, most frequent first. */
  counterparties: string[];
}

/** What sums up a group at a glance, from its Transactions. */
export function groupFacts(transactions: readonly FactsTransaction[]): GroupFacts {
  const totals = new Map<string, number>();
  const counterparties = new Map<string, number>();
  for (const { currency, amountMinor, counterpartyName } of transactions) {
    totals.set(currency, (totals.get(currency) ?? 0) + amountMinor);
    if (counterpartyName) {
      counterparties.set(counterpartyName, (counterparties.get(counterpartyName) ?? 0) + 1);
    }
  }
  const dates = transactions.map((t) => t.bookingDate).sort();
  return {
    totals: [...totals].map(([currency, amountMinor]) => ({ currency, amountMinor })),
    firstDate: dates[0],
    lastDate: dates.at(-1),
    counterparties: [...counterparties].sort((a, b) => b[1] - a[1]).map(([name]) => name),
  };
}

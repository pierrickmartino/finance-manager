/* PROTOTYPE — tiny helpers shared by the Payees redesign variants. Not a layout. */
import type { Payee } from '@/server/services/payees';

/** A recent Transaction of the selected Payee, already formatted on the server. */
export interface RecentTransaction {
  id: string;
  date: string;
  description: string;
  account: string;
  category: string;
  amount: string;
  isOutflow: boolean;
}

/** Payees bucketed by first letter ("#" for anything that isn't A-Z). */
export function byInitial(payees: Payee[]): { initial: string; payees: Payee[] }[] {
  const buckets = new Map<string, Payee[]>();
  for (const payee of payees) {
    const first = payee.name.trim().charAt(0).toUpperCase();
    const initial = /[A-Z]/.test(first) ? first : '#';
    buckets.set(initial, [...(buckets.get(initial) ?? []), payee]);
  }
  return [...buckets.entries()].map(([initial, list]) => ({ initial, payees: list }));
}

/** Lower-cased, accents, punctuation and legal suffixes stripped: "COOP Pronto AG" → "coop pronto". */
function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(ag|sa|gmbh|sarl|ltd|inc|llc|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Naive "possible duplicates": Payees whose normalised name is equal, or whose first word
 * (4+ letters) is shared. Busiest Payee of a cluster first, as the suggested merge target.
 */
export function duplicateClusters(payees: Payee[]): Payee[][] {
  const clusters = new Map<string, Payee[]>();
  for (const payee of payees) {
    const key = normalise(payee.name).split(' ')[0] ?? '';
    if (key.length < 4) continue;
    clusters.set(key, [...(clusters.get(key) ?? []), payee]);
  }
  return [...clusters.values()]
    .filter((cluster) => cluster.length > 1)
    .map((cluster) => [...cluster].sort((a, b) => b.transactionCount - a.transactionCount));
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/*
 * PROTOTYPE — throwaway. The read-only per-Tag summary the Tags page variants render, and the
 * small helpers they share. One query, grouped by Tag and Currency; nothing is written.
 */

import type { ServiceContext } from '@/server/services/context';
import type { Tag } from '@/server/services/tags';

export interface CurrencyTotal {
  currency: string;
  /** Sum of the outflows (≤ 0). */
  spentMinor: number;
  /** Sum of the inflows (≥ 0). */
  receivedMinor: number;
}

export interface TagSummary {
  tag: Tag;
  totals: CurrencyTotal[];
  /** Earliest and latest booking date of its Transactions, or null when unused. */
  firstDate: string | null;
  lastDate: string | null;
  /** Its most common Categories, most used first (at most 3). */
  topCategories: { name: string; count: number }[];
}

interface TotalRow extends CurrencyTotal {
  tagId: string;
  firstDate: string;
  lastDate: string;
}

export async function summarizeTags(ctx: ServiceContext, tags: Tag[]): Promise<TagSummary[]> {
  const [totals, categories] = await Promise.all([
    ctx.db.query<TotalRow>(
      `SELECT tt.tag_id AS "tagId", t.currency,
              coalesce(sum(t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0)::bigint AS "spentMinor",
              coalesce(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0)::bigint AS "receivedMinor",
              min(t.booking_date) AS "firstDate", max(t.booking_date) AS "lastDate"
       FROM transaction_tag tt JOIN "transaction" t ON t.id = tt.transaction_id
       GROUP BY tt.tag_id, t.currency ORDER BY t.currency`,
    ),
    ctx.db.query<{ tagId: string; name: string; count: number }>(
      `SELECT tt.tag_id AS "tagId", c.name, count(*)::int AS count
       FROM transaction_tag tt
       JOIN "transaction" t ON t.id = tt.transaction_id
       JOIN category c ON c.id = t.category_id
       GROUP BY tt.tag_id, c.name ORDER BY count DESC, c.name`,
    ),
  ]);
  return tags.map((tag) => {
    const rows = totals.rows.filter((row) => row.tagId === tag.id);
    const dates = rows.flatMap((row) => [row.firstDate, row.lastDate]).sort();
    return {
      tag,
      totals: rows.map(({ currency, spentMinor, receivedMinor }) => ({
        currency,
        spentMinor,
        receivedMinor,
      })),
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
      topCategories: categories.rows
        .filter((row) => row.tagId === tag.id)
        .slice(0, 3)
        .map(({ name, count }) => ({ name, count })),
    };
  });
}

/** Lower case, accents and non-alphanumerics removed: "Vacances 2024!" → "vacances2024". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

export interface DuplicatePair {
  /** The less used Tag, to merge away. */
  source: Tag;
  /** The more used one, to keep. */
  target: Tag;
}

/** Pairs of Tags whose names look like the same label (case, accents, a typo or a plural). */
export function likelyDuplicates(tags: Tag[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const [a, b] = [fold(tags[i]!.name), fold(tags[j]!.name)];
      if (!a || !b) continue;
      const isClose = a === b || (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= 1);
      if (!isClose) continue;
      const [source, target] =
        tags[i]!.transactionCount <= tags[j]!.transactionCount
          ? [tags[i]!, tags[j]!]
          : [tags[j]!, tags[i]!];
      pairs.push({ source, target });
    }
  }
  return pairs;
}

export function transactionsLabel(count: number): string {
  return `${count} Transaction${count === 1 ? '' : 's'}`;
}

export function tagHref(variant: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams({ variant });
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `/tags?${search.toString()}`;
}

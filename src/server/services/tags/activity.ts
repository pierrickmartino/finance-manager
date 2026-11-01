import type { ServiceContext } from '../context';
import { findTag } from './model';

/** Money a Tag's Transactions moved in one Currency. */
export interface TagCurrencyTotal {
  currency: string;
  /** Sum of the outflows (≤ 0). */
  outMinor: number;
  /** Sum of the inflows (≥ 0). */
  inMinor: number;
}

/** What a Tag's Transactions add up to, for its detail pane. */
export interface TagActivity {
  /** One entry per Currency, by Currency code. */
  totals: TagCurrencyTotal[];
  /** Booking dates of its earliest and latest Transaction; null when unused. */
  firstDate: string | null;
  lastDate: string | null;
  /** Its most used Categories (at most three), most used first, then by name. */
  topCategories: { name: string; transactionCount: number }[];
}

const TOP_CATEGORY_COUNT = 3;

/** Per-Currency totals, period and top Categories of one Tag's Transactions. */
export async function getTagActivity(ctx: ServiceContext, tagId: string): Promise<TagActivity> {
  await findTag(ctx.db, tagId);
  const [totals, categories] = await Promise.all([
    ctx.db.query<TagCurrencyTotal & { firstDate: string; lastDate: string }>(
      `SELECT t.currency,
              coalesce(sum(t.amount_minor) FILTER (WHERE t.amount_minor < 0), 0)::bigint
                AS "outMinor",
              coalesce(sum(t.amount_minor) FILTER (WHERE t.amount_minor > 0), 0)::bigint
                AS "inMinor",
              min(t.booking_date) AS "firstDate", max(t.booking_date) AS "lastDate"
       FROM transaction_tag tt JOIN "transaction" t ON t.id = tt.transaction_id
       WHERE tt.tag_id = $1
       GROUP BY t.currency ORDER BY t.currency`,
      [tagId],
    ),
    ctx.db.query<{ name: string; transactionCount: number }>(
      `SELECT c.name, count(*)::int AS "transactionCount"
       FROM transaction_tag tt
       JOIN "transaction" t ON t.id = tt.transaction_id
       JOIN category c ON c.id = t.category_id
       WHERE tt.tag_id = $1
       GROUP BY c.id, c.name ORDER BY "transactionCount" DESC, lower(c.name), c.id
       LIMIT $2`,
      [tagId, TOP_CATEGORY_COUNT],
    ),
  ]);
  const firstDates = totals.rows.map((row) => row.firstDate).sort();
  const lastDates = totals.rows.map((row) => row.lastDate).sort();
  return {
    totals: totals.rows.map(({ currency, outMinor, inMinor }) => ({ currency, outMinor, inMinor })),
    firstDate: firstDates[0] ?? null,
    lastDate: lastDates.at(-1) ?? null,
    topCategories: categories.rows,
  };
}

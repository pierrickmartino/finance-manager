import { z } from 'zod';
import { withTransaction } from '@/server/db/transaction';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import type { AttentionKind, FormedAttentionItem } from './kind';
import {
  missedKind,
  priceIncreaseKind,
  type MissedAttentionItem,
  type PriceIncreaseAttentionItem,
} from './recurring';
import { unclassifiedKind, type UnclassifiedAttentionItem } from './unclassified';

/**
 * Attention items (GLOSSARY, ADR-0019): the conditions in the current data that ask the user to
 * act, as the notifications bell lists them. They are worked out on each call from the same
 * checks their own pages use, never stored, and go away by themselves once fixed. Only what the
 * bell listed when last opened is stored (the seen set), to tell which items are unread.
 *
 * A kind lives in its own file (see `kind.ts`): it lists its items and defines its form and
 * "got worse" rule. Adding one means adding its item type to `ListedAttentionItem` and the kind
 * to `KINDS`, in display order.
 */

export type { AttentionTone } from './kind';
export type { MissedAttentionItem, PriceIncreaseAttentionItem } from './recurring';
export type { UnclassifiedAttentionItem } from './unclassified';

/** An Attention item of any kind, as its kind lists it. */
export type ListedAttentionItem =
  MissedAttentionItem | PriceIncreaseAttentionItem | UnclassifiedAttentionItem;

/** An Attention item, and whether it is unread: new, or worse, since the bell was last opened. */
export type AttentionItem = ListedAttentionItem & { unread: boolean };

/**
 * Every kind, in display order: FX rates, Completeness by severity, Missed, Price increase,
 * Unclassified.
 */
const KINDS: readonly AttentionKind<ListedAttentionItem>[] = [
  missedKind,
  priceIncreaseKind,
  unclassifiedKind,
];

const input = z.object({ today: z.iso.date() });

/** The seen set's key for an item: its identity, kind plus subject. */
function identity(item: { kind: string; subject: string | null }): string {
  return JSON.stringify([item.kind, item.subject ?? '']);
}

async function currentItems(
  ctx: ServiceContext,
  today: string,
): Promise<FormedAttentionItem<ListedAttentionItem>[]> {
  const byKind = await Promise.all(KINDS.map((kind) => kind.list(ctx, today)));
  return byKind.flat();
}

/** One stored item of the seen set: its identity and the form it was seen in. */
interface SeenRow {
  kind: string;
  subject: string;
  form: unknown;
}

/** The stored seen set, by identity. */
async function loadSeen(ctx: ServiceContext): Promise<Map<string, SeenRow>> {
  const result = await ctx.db.query<SeenRow>('SELECT kind, subject, form FROM attention_seen');
  return new Map(result.rows.map((row) => [identity(row), row]));
}

/**
 * Drops from the seen set the items that went away, so one that comes back is unread even if
 * the bell was not opened while it was gone. Writes only when something went away.
 */
async function forgetGone(
  ctx: ServiceContext,
  seen: ReadonlyMap<string, SeenRow>,
  items: readonly FormedAttentionItem<ListedAttentionItem>[],
): Promise<void> {
  const current = new Set(items.map(({ item }) => identity(item)));
  const gone = [...seen].filter(([key]) => !current.has(key)).map(([, row]) => row);
  if (gone.length === 0) return;
  await ctx.db.query(
    `DELETE FROM attention_seen
     WHERE (kind, subject) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
    [gone.map((row) => row.kind), gone.map((row) => row.subject)],
  );
}

/**
 * The current Attention items, in display order. An item is unread when its identity is not in
 * the seen set, or when its kind says it got worse since. `today` is passed in; the clock is
 * never read.
 */
export async function listAttentionItems(
  ctx: ServiceContext,
  input_: { today: string },
): Promise<AttentionItem[]> {
  const { today } = parseInput(input, input_);
  const [items, seen] = await Promise.all([currentItems(ctx, today), loadSeen(ctx)]);
  await forgetGone(ctx, seen, items);
  return items.map(({ item, isUnreadAgainst }) => {
    const stored = seen.get(identity(item));
    return { ...item, unread: stored === undefined || isUnreadAgainst(stored.form) };
  });
}

/**
 * Marks every current Attention item read: replaces the seen set with each item's identity and
 * form as listed now. Not domain data, so it writes no History entries.
 */
export async function markAttentionSeen(
  ctx: ServiceContext,
  input_: { today: string },
): Promise<void> {
  const { today } = parseInput(input, input_);
  const items = await currentItems(ctx, today);
  await withTransaction(ctx.db, async (tx) => {
    // Two opens at once would both delete and then insert the same identities: one at a time.
    await tx.query('LOCK TABLE attention_seen IN SHARE ROW EXCLUSIVE MODE');
    await tx.query('DELETE FROM attention_seen');
    await tx.query(
      `INSERT INTO attention_seen (kind, subject, form)
       SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[])`,
      [
        items.map(({ item }) => item.kind),
        items.map(({ item }) => item.subject ?? ''),
        items.map(({ form }) => JSON.stringify(form)),
      ],
    );
  });
}

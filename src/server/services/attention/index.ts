import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { withTransaction } from '@/server/db/transaction';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { completenessKind, type CompletenessAttentionItem } from './completeness';
import { fxRatesKind, type FxRatesAttentionItem } from './fx-rates';
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

export type { CompletenessAttentionItem } from './completeness';
export type { FxRatesAttentionItem } from './fx-rates';
export type { AttentionTone } from './kind';
export type { MissedAttentionItem, PriceIncreaseAttentionItem } from './recurring';
export type { UnclassifiedAttentionItem } from './unclassified';

/** An Attention item of any kind, as its kind lists it. */
export type ListedAttentionItem =
  | FxRatesAttentionItem
  | CompletenessAttentionItem
  | MissedAttentionItem
  | PriceIncreaseAttentionItem
  | UnclassifiedAttentionItem;

/**
 * An Attention item, with its identity (kind plus subject) as one key, as the seen set holds it,
 * and whether it is unread: new, or worse, since the bell was last opened.
 */
export type AttentionItem = ListedAttentionItem & { key: string; unread: boolean };

/**
 * Every kind, in display order: FX rates, Completeness by severity, Missed, Price increase,
 * Unclassified.
 */
const KINDS: readonly AttentionKind<ListedAttentionItem>[] = [
  fxRatesKind,
  completenessKind,
  missedKind,
  priceIncreaseKind,
  unclassifiedKind,
];

const todaySchema = z.object({ today: z.iso.date() });

/** An item's identity, kind plus subject, as one key: the seen set's and the bell's. */
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

/** The pool, or a transaction's client. */
type Queryable = Pick<Db, 'query'>;

/** The stored seen set, by identity. */
async function loadSeen(db: Queryable): Promise<Map<string, SeenRow>> {
  const result = await db.query<SeenRow>('SELECT kind, subject, form FROM attention_seen');
  return new Map(result.rows.map((row) => [identity(row), row]));
}

/** The identities in the seen set whose item is no longer current. */
function goneKeys(
  seen: ReadonlyMap<string, SeenRow>,
  items: readonly FormedAttentionItem<ListedAttentionItem>[],
): string[] {
  const current = new Set(items.map(({ item }) => identity(item)));
  return [...seen.keys()].filter((key) => !current.has(key));
}

/** Opening the bell and forgetting what went away both write the seen set: one at a time. */
async function lockSeen(tx: Queryable): Promise<void> {
  await tx.query('LOCK TABLE attention_seen IN SHARE ROW EXCLUSIVE MODE');
}

/**
 * The seen set, less the items no longer current, which it forgets: one that comes back is
 * unread even if the bell was not opened while it was gone (ADR-0019). It writes only when
 * something went away, and then under the lock `markAttentionSeen` takes, reading the set again
 * there, so it never undoes a bell opened meanwhile.
 */
async function seenForgettingGone(
  ctx: ServiceContext,
  items: readonly FormedAttentionItem<ListedAttentionItem>[],
): Promise<ReadonlyMap<string, SeenRow>> {
  const seen = await loadSeen(ctx.db);
  if (goneKeys(seen, items).length === 0) return seen;
  return withTransaction(ctx.db, async (tx) => {
    await lockSeen(tx);
    const locked = await loadSeen(tx);
    const gone = goneKeys(locked, items).map((key) => locked.get(key)!);
    await tx.query(
      `DELETE FROM attention_seen
       WHERE (kind, subject) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
      [gone.map((row) => row.kind), gone.map((row) => row.subject)],
    );
    return new Map([...locked].filter(([, row]) => !gone.includes(row)));
  });
}

/**
 * The current Attention items, in display order. An item is unread when its identity is not in
 * the seen set, or when its kind says it got worse since. Items are worked out for `today`,
 * except the FX rates' status, which reads the clock as the Accounts page's notice does.
 */
export async function listAttentionItems(
  ctx: ServiceContext,
  input: { today: string },
): Promise<AttentionItem[]> {
  const { today } = parseInput(todaySchema, input);
  const items = await currentItems(ctx, today);
  const seen = await seenForgettingGone(ctx, items);
  return items.map(({ item, isUnreadAgainst }) => {
    const key = identity(item);
    const stored = seen.get(key);
    return { ...item, key, unread: stored === undefined || isUnreadAgainst(stored.form) };
  });
}

/**
 * Marks every current Attention item read: replaces the seen set with each item's identity and
 * form as listed now. Not domain data, so it writes no History entries.
 */
export async function markAttentionSeen(
  ctx: ServiceContext,
  input: { today: string },
): Promise<void> {
  const { today } = parseInput(todaySchema, input);
  const items = await currentItems(ctx, today);
  await withTransaction(ctx.db, async (tx) => {
    // Two opens at once would both delete and then insert the same identities.
    await lockSeen(tx);
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

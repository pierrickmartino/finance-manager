import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { getClassificationProgress } from '../transactions/unclassified';

/**
 * Attention items (GLOSSARY, ADR-0019): the conditions in the current data that ask the user to
 * act, as the notifications bell lists them. They are worked out on each call from the same
 * checks their own pages use, never stored, and go away by themselves once fixed.
 */

/** How strongly an item asks for attention; the bell draws it as a badge of that tone. */
export type AttentionTone = 'warning' | 'info' | 'neutral';

/** Transactions are Unclassified: one item for all of them, with their count. */
export interface UnclassifiedAttentionItem {
  kind: 'unclassified';
  /** What the item is about; Unclassified is about no one Account or Recurring payment. */
  subject: null;
  /** How many Transactions are Unclassified, as the Unclassified view counts them. */
  count: number;
  /** Where the item is fixed. */
  href: '/unclassified';
  tone: AttentionTone;
}

export type AttentionItem = UnclassifiedAttentionItem;

const listInput = z.object({ today: z.iso.date() });

/**
 * The current Attention items, in display order. `today` is passed in; the clock is never read.
 */
export async function listAttentionItems(
  ctx: ServiceContext,
  input: { today: string },
): Promise<AttentionItem[]> {
  parseInput(listInput, input);
  const { unclassified } = await getClassificationProgress(ctx);
  return unclassified === 0 ? [] : [unclassifiedItem(unclassified)];
}

function unclassifiedItem(count: number): UnclassifiedAttentionItem {
  return { kind: 'unclassified', subject: null, count, href: '/unclassified', tone: 'warning' };
}

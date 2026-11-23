'use server';

import { runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  listAttentionItems,
  markAttentionSeen,
  type AttentionItem,
} from '@/server/services/attention';
import { swissToday } from '@/server/services/fx/dates';

/**
 * Marks every current Attention item read: the bell was opened. It refreshes nothing, as the
 * bell already shows its dot cleared, and refreshing would drop the unread markers it shows.
 */
export async function markAttentionSeenAction(): Promise<ActionResult> {
  return runAction(async () =>
    markAttentionSeen(await getServiceContext(), { today: swissToday() }),
  );
}

/**
 * The current Attention items, for the bell to catch up after a navigation: the shell's layout
 * is not rendered again when only the page changes.
 */
export async function loadAttentionItemsAction(): Promise<ActionResult<AttentionItem[]>> {
  return runAction(async () =>
    listAttentionItems(await getServiceContext(), { today: swissToday() }),
  );
}

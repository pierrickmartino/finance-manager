'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { AttentionItem } from '@/server/services/attention';
import { loadAttentionItemsAction, markAttentionSeenAction } from './attention-actions';

interface AttentionItemsState {
  /** The items the server rendered the bell with, to tell when it renders new ones. */
  served: readonly AttentionItem[] | null;
  /** The items the bell shows: the served ones, or newer ones. */
  items: readonly AttentionItem[] | null;
}

/**
 * The bell's current Attention items. They come from the server render, so a server action that
 * refreshes the page refreshes them. A navigation does not render the shell again, so on each
 * one they are asked for afresh. There is no polling (ADR-0019).
 */
export function useAttentionItems(served: readonly AttentionItem[] | null): {
  items: readonly AttentionItem[] | null;
  /** Marks every item read: the dot clears at once, and the server stores the seen set. */
  markSeen: () => void;
} {
  const pathname = usePathname();
  const [state, setState] = useState<AttentionItemsState>({ served, items: served });
  const lastPathname = useRef(pathname);
  // Counts the bell's openings and navigations: an answer to an older one is out of date.
  const generation = useRef(0);

  let current = state;
  if (state.served !== served) {
    current = { served, items: served };
    setState(current);
  }

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    const asked = ++generation.current;
    void loadAttentionItemsAction().then((result) => {
      if (!result.ok || generation.current !== asked) return;
      setState((previous) => ({ ...previous, items: result.data }));
    });
  }, [pathname]);

  function markSeen() {
    generation.current++;
    setState((previous) => ({
      ...previous,
      items: previous.items?.map((item) => ({ ...item, unread: false })) ?? null,
    }));
    void markAttentionSeenAction();
  }

  return { items: current.items, markSeen };
}

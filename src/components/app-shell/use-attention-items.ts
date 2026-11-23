'use client';

import { usePathname } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import type { AttentionItem } from '@/server/services/attention';
import { loadAttentionItemsAction, markAttentionSeenAction } from './attention-actions';

/** The Attention items as the server renders them: still being worked out when the bell hydrates. */
export type ServedAttentionItems = Promise<readonly AttentionItem[]>;

/** Where the bell's items come from: the served ones, until newer ones replace them. */
export interface AttentionItemsSource {
  served: ServedAttentionItems;
  /** Items newer than the served ones (after a navigation, or once marked read); null for none. */
  newer: readonly AttentionItem[] | null;
}

/**
 * The bell's current Attention items, as a source its parts read with `useItems`. They come from
 * the server render, so a server action that refreshes the page refreshes them. A navigation
 * does not render the shell again, so on each one they are asked for afresh. There is no polling
 * (ADR-0019).
 */
export function useAttentionItems(served: ServedAttentionItems): {
  source: AttentionItemsSource;
  /** Marks `items` read: the dot clears at once, and the server stores the seen set. */
  markSeen: (items: readonly AttentionItem[]) => void;
} {
  const pathname = usePathname();
  const [state, setState] = useState<AttentionItemsSource>({ served, newer: null });
  const lastPathname = useRef(pathname);
  // Counts the bell's openings and navigations: an answer to an older one is out of date.
  const generation = useRef(0);

  let current = state;
  if (state.served !== served) {
    current = { served, newer: null };
    setState(current);
  }

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    const asked = ++generation.current;
    void loadAttentionItemsAction().then((result) => {
      if (!result.ok || generation.current !== asked) return;
      setState((previous) => ({ ...previous, newer: result.data }));
    });
  }, [pathname]);

  const markSeen = useCallback((items: readonly AttentionItem[]) => {
    generation.current++;
    setState((previous) => ({
      ...previous,
      newer: items.map((item) => ({ ...item, unread: false })),
    }));
    void markAttentionSeenAction();
  }, []);

  return { source: current, markSeen };
}

/** The items to show: suspends, under the caller's Suspense boundary, until they are served. */
export function useItems(source: AttentionItemsSource): readonly AttentionItem[] {
  const served = use(source.served);
  return source.newer ?? served;
}

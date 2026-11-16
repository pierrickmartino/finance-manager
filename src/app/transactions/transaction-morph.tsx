'use client';

import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  ViewTransition,
  type ReactElement,
  type ReactNode,
} from 'react';
import { minWidthQuery } from '@/lib/breakpoints';
import { createSharedSubscription } from '@/lib/shared-subscription';
import { isMorphing, type MorphPart } from '@/lib/transaction-morph';

/** Tailwind's `xl`: the Transaction preview shows beside the list from here up. */
const WIDE_QUERY = minWidthQuery('xl');

/*
 * One listener on the query for every boundary, so all of them switch in the same render
 * across `xl`: with one each, the preview's header could be named before the row lets go.
 */
const wideChanges = createSharedSubscription((onChange) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
});

/**
 * Whether the Transaction preview shows; `null` while server-rendering and hydrating, when the
 * width isn't known yet. Naming no source until then means hydration only ever adds a name:
 * swapping it from the row to the preview in one render would mount it twice for a moment.
 */
function useIsWide(): boolean | null {
  return useSyncExternalStore(
    wideChanges.subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null,
  );
}

/*
 * How many Transaction detail headers are mounted. Counted in layout effects, which run in the
 * commit itself: React holds passive effects back until a running view transition ends.
 */
let detailsShown = 0;

function useCountDetailShown(part: MorphPart): void {
  useLayoutEffect(() => {
    if (part !== 'detail') return;
    detailsShown += 1;
    return () => {
      detailsShown -= 1;
    };
  }, [part]);
}

/**
 * For the loading skeleton: whether another Transaction detail was on screen when it started
 * loading. Read once, while the skeleton first renders: the detail it replaces is unmounted only
 * when the skeleton commits.
 */
function useIsFromDetail(part: MorphPart): boolean {
  const [isFromDetail] = useState(() => part === 'loading' && detailsShown > 0);
  return isFromDetail;
}

interface TransactionMorphProps {
  transactionId: string;
  part: MorphPart;
  /** One element: the row, or a header. */
  children: ReactNode;
}

/**
 * Names `children` after the Transaction, so opening it morphs the row (or the preview's header)
 * into the Transaction detail's header, and going back reverses it. Only one source is named per
 * width (`isMorphing`), so a name is never mounted twice. Nothing else animates: a boundary never
 * enters, leaves or updates on its own, so picking another Transaction in the preview stays
 * instant, and so does stepping from one Transaction detail to another.
 */
export function TransactionMorph({
  transactionId,
  part,
  children,
}: TransactionMorphProps): ReactElement {
  useCountDetailShown(part);
  const fromDetail = useIsFromDetail(part);
  const isNamed = isMorphing(part, useIsWide(), { fromDetail });
  return (
    // A boundary that gains or loses the name (across `xl`, or once hydrated) is a new one: React
    // tracks a name from its boundary's mount to its unmount, so naming or unnaming a mounted
    // one would leave the name counted as taken. Not keyed by the Transaction: the preview
    // moving to another one must stay an update, since a new boundary would crossfade the page.
    <ViewTransition
      key={isNamed ? 'named' : 'unnamed'}
      name={isNamed ? `transaction-${transactionId}` : 'auto'}
      share="auto"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

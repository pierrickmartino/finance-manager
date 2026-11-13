'use client';

import { useSyncExternalStore, ViewTransition, type ReactNode } from 'react';

/** Tailwind's `xl`: the Transaction preview shows beside the list from here up. */
const WIDE_QUERY = '(min-width: 80rem)';

/**
 * Where an opened Transaction morphs from or to (ADR-0012): its row below `xl`, the Transaction
 * preview's header from `xl` up, and the Transaction detail's header.
 */
export type MorphPart = 'row' | 'preview' | 'detail';

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Whether the Transaction preview shows; `null` while server-rendering and hydrating, when the
 * width isn't known yet. Naming no source until then means hydration only ever adds a name:
 * swapping it from the row to the preview in one render would mount it twice for a moment.
 */
function useIsWide(): boolean | null {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null,
  );
}

/** Whether `part` is the element the Transaction morphs with at the current width. */
function isMorphing(part: MorphPart, isWide: boolean | null): boolean {
  if (part === 'detail') return true;
  if (isWide === null) return false;
  return part === 'preview' ? isWide : !isWide;
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
 * width, so a name is never mounted twice. Nothing else animates: a boundary never enters,
 * leaves or updates on its own, so picking another Transaction in the preview stays instant.
 */
export function TransactionMorph({ transactionId, part, children }: TransactionMorphProps) {
  const isWide = useIsWide();
  return (
    <ViewTransition
      name={isMorphing(part, isWide) ? `transaction-${transactionId}` : 'auto'}
      share="auto"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

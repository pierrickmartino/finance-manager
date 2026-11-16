'use client';

import { useLayoutEffect } from 'react';
import { useGuardedPush } from '@/components/unsaved-changes';
import { listStepFor } from '@/lib/list-step-keys';

/**
 * Opens a neighbouring Transaction of the Transactions list from its Transaction detail. The
 * one path the `j` / `k` keys navigate by: like the Previous / Next links, it asks before
 * discarding unsaved edits (spec #152, story 27).
 */
export function useStepThroughList(): (href: string) => void {
  return useGuardedPush();
}

interface ListStepKeysProps {
  /** The previous Transaction's detail, or null at the start of the list. */
  previousHref: string | null;
  /** The next Transaction's detail, or null at the end of the list. */
  nextHref: string | null;
}

/** `j` opens the next Transaction and `k` the previous one, unless typing or at an end. */
export function ListStepKeys({ previousHref, nextHref }: ListStepKeysProps): null {
  const stepTo = useStepThroughList();

  // A layout effect, so the keys work from the moment the stepper shows: React holds passive
  // effects back until a running view transition (the open's morph, ADR-0012) has ended.
  useLayoutEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const step = listStepFor({ ...pickKeys(event), target });
      const href = step === 'next' ? nextHref : step === 'previous' ? previousHref : null;
      if (!href) return;
      event.preventDefault();
      stepTo(href);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [previousHref, nextHref, stepTo]);

  return null;
}

function pickKeys(event: KeyboardEvent) {
  const { key, ctrlKey, metaKey, altKey, shiftKey, isComposing } = event;
  return { key, ctrlKey, metaKey, altKey, shiftKey, isComposing };
}

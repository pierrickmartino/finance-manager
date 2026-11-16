'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ActionResult } from '@/server/actions';

/** What leaving a page with unsaved edits asks first. */
const DISCARD_UNSAVED_MESSAGE = 'Discard unsaved changes?';

interface UnsavedChanges {
  /** Records whether the form named `source` differs from its saved values. */
  report: (source: string, isDirty: boolean) => void;
  /** True when nothing is unsaved, or the user agreed to discard it. */
  confirmLeave: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChanges | null>(null);

/** Leaving is always fine outside a guard: nothing reports unsaved edits there. */
const alwaysLeave = () => true;

/** The part of the browser's Navigation API's `navigate` event the guard reads. */
interface NavigateEventLike extends Event {
  navigationType: 'push' | 'replace' | 'reload' | 'traverse';
  destination: { sameDocument: boolean };
}

/**
 * Asks before the browser's back or forward leaves unsaved edits for another page of the app
 * (spec #152, story 30), which `beforeunload` doesn't cover: the app handles those moves itself,
 * and `popstate` comes too late to stop them (the router hears it first). The Navigation API's
 * `navigate` event comes before the move and can cancel it. Browsers let a page cancel one only
 * once the user has interacted with it (`cancelable`), which typing the edits always is; where
 * the API is missing, the move goes ahead. Leaving the app is `beforeunload`'s, not asked twice.
 */
function useGuardHistoryTraversal(confirmLeave: () => boolean): void {
  useLayoutEffect(() => {
    const { navigation } = window as { navigation?: EventTarget };
    if (!navigation) return;
    function onNavigate(event: Event) {
      const { navigationType, destination, cancelable } = event as NavigateEventLike;
      if (navigationType !== 'traverse' || !destination.sameDocument || !cancelable) return;
      if (!confirmLeave()) event.preventDefault();
    }
    navigation.addEventListener('navigate', onNavigate);
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, [confirmLeave]);
}

/**
 * Keeps unsaved edits from being lost silently (spec #152, stories 27-31). Forms inside report
 * whether they are dirty with `useUnsavedDraft`; while any is, the guarded links and navigations
 * below, and the browser's back and forward, ask "Discard unsaved changes?" first, and the
 * browser warns on reload, close or leaving the app. Nothing is ever saved on the way out.
 */
export function UnsavedChangesGuard({ children }: { children: ReactNode }): ReactElement {
  const dirtySources = useRef<ReadonlySet<string>>(new Set());

  const guard = useMemo<UnsavedChanges>(
    () => ({
      report(source, isDirty) {
        const others = [...dirtySources.current].filter((name) => name !== source);
        dirtySources.current = new Set(isDirty ? [...others, source] : others);
      },
      confirmLeave() {
        return dirtySources.current.size === 0 || window.confirm(DISCARD_UNSAVED_MESSAGE);
      },
    }),
    [],
  );
  useGuardHistoryTraversal(guard.confirmLeave);

  // Layout effects, here and below: React holds passive effects, and their cleanups, back until
  // a running view transition ends, so a guard left by the morph back to the list would still
  // warn, for edits the user already agreed to discard, until the morph was over.
  useLayoutEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtySources.current.size > 0) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return <UnsavedChangesContext value={guard}>{children}</UnsavedChangesContext>;
}

/** Tells the enclosing guard whether this form's edits are unsaved; forgets them on unmount. */
function useReportUnsaved(source: string, isDirty: boolean): void {
  const guard = useContext(UnsavedChangesContext);
  useLayoutEffect(() => {
    if (!guard) return;
    guard.report(source, isDirty);
    return () => guard.report(source, false);
  }, [guard, source, isDirty]);
}

/**
 * Tracks whether a form's `draft` (its values, serialised; null until known) differs from what
 * was last saved, and tells the enclosing guard. The first known draft is the saved one; a
 * successful `result` of the form's action makes the draft submitted with it the saved one, so
 * edits typed while it was saving stay unsaved. Returns what the form calls as it submits.
 */
export function useUnsavedDraft(
  source: string,
  draft: string | null,
  result: ActionResult<unknown> | null,
): () => void {
  const [saved, setSaved] = useState(draft);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [settledResult, setSettledResult] = useState(result);
  if (saved === null && draft !== null) setSaved(draft);
  if (result !== settledResult) {
    setSettledResult(result);
    if (result?.ok && submitted !== null) setSaved(submitted);
  }
  useReportUnsaved(source, draft !== null && saved !== null && draft !== saved);
  return () => setSubmitted(draft);
}

/** Asks before leaving while edits are unsaved; true when it is fine to go. */
function useConfirmLeave(): () => boolean {
  return useContext(UnsavedChangesContext)?.confirmLeave ?? alwaysLeave;
}

/** `router.push`, but only once the user agreed to discard any unsaved edits. */
export function useGuardedPush(): (href: string) => void {
  const router = useRouter();
  const confirmLeave = useConfirmLeave();
  return useCallback(
    (href: string) => {
      if (confirmLeave()) router.push(href);
    },
    [router, confirmLeave],
  );
}

/**
 * A `<Link>` that asks before leaving unsaved edits. Only client navigations are asked about:
 * opening it in a new tab or window leaves this page, and its edits, where they are.
 */
export function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof Link>): ReactElement {
  const confirmLeave = useConfirmLeave();
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (!confirmLeave()) event.preventDefault();
      }}
    />
  );
}

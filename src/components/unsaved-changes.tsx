'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';

/** What leaving a page with unsaved edits asks first. */
export const DISCARD_UNSAVED_MESSAGE = 'Discard unsaved changes?';

interface UnsavedChanges {
  /** Records whether the form named `source` differs from its saved values. */
  report: (source: string, isDirty: boolean) => void;
  /** True when nothing is unsaved, or the user agreed to discard it. */
  confirmLeave: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChanges | null>(null);

/** Leaving is always fine outside a guard: nothing reports unsaved edits there. */
const alwaysLeave = () => true;

/**
 * Keeps unsaved edits from being lost silently (spec #152, stories 27-31). Forms inside report
 * whether they are dirty with `useReportUnsaved`; while any is, the guarded links and navigations
 * below ask "Discard unsaved changes?" first, and the browser warns on reload, close or leaving
 * the app. Nothing is ever saved on the way out.
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

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtySources.current.size > 0) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return <UnsavedChangesContext value={guard}>{children}</UnsavedChangesContext>;
}

/** Tells the enclosing guard whether this form's edits are unsaved; forgets them on unmount. */
export function useReportUnsaved(source: string, isDirty: boolean): void {
  const guard = useContext(UnsavedChangesContext);
  useEffect(() => {
    if (!guard) return;
    guard.report(source, isDirty);
    return () => guard.report(source, false);
  }, [guard, source, isDirty]);
}

/** Asks before leaving while edits are unsaved; true when it is fine to go. */
export function useConfirmLeave(): () => boolean {
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

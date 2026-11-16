import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { LIST_STEP_KEYS } from '@/lib/list-step-keys';
import type { TransactionPlace } from '@/server/services/transactions';
import { transactionDetailHref, type SearchValues } from '../search';
import { ListStepKeys } from './list-step-keys';

interface ListStepperProps {
  place: TransactionPlace;
  /** The list's search values, carried on to the neighbours' details (ADR-0013). */
  values: SearchValues;
}

/**
 * "‹ Previous · 12 of 48 · Next ›" on a Transaction detail opened from the Transactions list
 * ("12/48" on narrow screens), with `k` / `j` as their keys. A Transaction that no longer
 * matches the list (just classified out of it, or a Transfer counterpart outside it) shows
 * "— of 19" and says so; it still steps to its neighbours in the list's order. An end with no
 * neighbour is shown but is not a link, so the list never wraps round.
 */
export function ListStepper({ place, values }: ListStepperProps): ReactElement {
  const position = place.position ?? '—';
  const previousHref = place.previousId ? transactionDetailHref(place.previousId, values) : null;
  const nextHref = place.nextId ? transactionDetailHref(place.nextId, values) : null;
  return (
    <nav aria-label="Transactions list" className="flex flex-wrap items-center gap-3 text-sm">
      <ListStepKeys previousHref={previousHref} nextHref={nextHref} />
      {!place.matches && <span className="text-muted">No longer matches this list</span>}
      <Step href={previousHref} label="Previous Transaction" shortcut={LIST_STEP_KEYS.previous}>
        ‹ Previous
      </Step>
      <span className="text-muted tabular-nums">
        <span aria-hidden="true" className="sm:hidden">
          {position}/{place.total}
        </span>
        <span className="sr-only sm:not-sr-only">
          {position} of {place.total}
        </span>
      </span>
      <Step href={nextHref} label="Next Transaction" shortcut={LIST_STEP_KEYS.next}>
        Next ›
      </Step>
    </nav>
  );
}

interface StepProps {
  href: string | null;
  label: string;
  /** The key that follows this step, shown as a hint beside it. */
  shortcut: string;
  children: ReactNode;
}

function Step({ href, label, shortcut, children }: StepProps): ReactElement {
  if (!href) {
    return (
      <span aria-disabled="true" className="inline-flex items-center gap-1.5 text-faint">
        {children}
        <KeyHint>{shortcut}</KeyHint>
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      className="inline-flex items-center gap-1.5 font-medium text-ink-soft hover:underline"
    >
      {children}
      <KeyHint>{shortcut}</KeyHint>
    </Link>
  );
}

/** A key's hint: decoration only, the link names its shortcut in `aria-keyshortcuts`. */
function KeyHint({ children }: { children: ReactNode }): ReactElement {
  return (
    <kbd
      aria-hidden="true"
      className="rounded border border-rule bg-sunken px-1 font-mono text-xs leading-4 font-normal text-muted"
    >
      {children}
    </kbd>
  );
}

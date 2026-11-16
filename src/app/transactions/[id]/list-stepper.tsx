import type { ReactElement, ReactNode } from 'react';
import { KEY_HINT_CLASS, STEP_LINK_CLASS, STEP_LINK_DISABLED_CLASS } from '@/components/surface';
import { GuardedLink } from '@/components/unsaved-changes';
import { LIST_STEP_KEYS } from '@/lib/list-step-keys';
import type { TransactionPlace } from '@/server/services/transactions';
import { transactionDetailHref, type SearchValues } from '../search';
import { ListStepKeys } from './list-step-keys';

interface ListStepperProps {
  place: TransactionPlace;
  /** The list's filters, carried on to the neighbours' details (ADR-0013). */
  listFilters: SearchValues;
}

/**
 * "‹ Previous · 12 of 48 · Next ›" on a Transaction detail opened from the Transactions list
 * ("12/48" on narrow screens), with `k` / `j` as their keys. A Transaction that no longer
 * matches the list (just classified out of it, or a Transfer counterpart outside it) shows
 * "— of 19" and says so; it still steps to its neighbours in the list's order. An end with no
 * neighbour is shown but is not a link, so the list never wraps round. The count is a polite
 * status, so a screen reader announces it as it changes (story 35).
 */
export function ListStepper({ place, listFilters }: ListStepperProps): ReactElement {
  const position = place.position ?? '—';
  const previousHref = place.previousId
    ? transactionDetailHref(place.previousId, listFilters)
    : null;
  const nextHref = place.nextId ? transactionDetailHref(place.nextId, listFilters) : null;
  return (
    <nav aria-label="Transactions list" className="flex flex-wrap items-center gap-3 text-sm">
      <ListStepKeys previousHref={previousHref} nextHref={nextHref} />
      <Step href={previousHref} label="Previous Transaction" shortcut={LIST_STEP_KEYS.previous}>
        ‹ Previous
      </Step>
      <p role="status" className="flex flex-wrap items-center gap-x-3 text-muted">
        <span className="tabular-nums">
          <span aria-hidden="true" className="sm:hidden">
            {position}/{place.total}
          </span>
          <span className="sr-only sm:not-sr-only">
            {position} of {place.total}
          </span>
        </span>
        {!place.matches && <span>No longer matches this list</span>}
      </p>
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
  const hint = (
    <kbd aria-hidden="true" className={KEY_HINT_CLASS}>
      {shortcut}
    </kbd>
  );
  if (!href) {
    return (
      <span aria-disabled="true" className={STEP_LINK_DISABLED_CLASS}>
        {children}
        {hint}
      </span>
    );
  }
  return (
    <GuardedLink
      href={href}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      className={STEP_LINK_CLASS}
    >
      {children}
      {hint}
    </GuardedLink>
  );
}

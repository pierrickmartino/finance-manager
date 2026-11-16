import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import type { TransactionPlace } from '@/server/services/transactions';
import { transactionDetailHref, type SearchValues } from '../search';

interface ListStepperProps {
  place: TransactionPlace;
  /** The list's search values, carried on to the neighbours' details (ADR-0013). */
  values: SearchValues;
}

/**
 * "‹ Previous · 12 of 48 · Next ›" on a Transaction detail opened from the Transactions list
 * ("12/48" on narrow screens). An end with no neighbour is shown but is not a link, so the
 * list never wraps round.
 */
export function ListStepper({ place, values }: ListStepperProps): ReactElement {
  const position = place.position ?? '—';
  return (
    <nav aria-label="Transactions list" className="flex items-center gap-3 text-sm">
      <Step id={place.previousId} values={values} label="Previous Transaction">
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
      <Step id={place.nextId} values={values} label="Next Transaction">
        Next ›
      </Step>
    </nav>
  );
}

interface StepProps {
  id: string | null;
  values: SearchValues;
  label: string;
  children: ReactNode;
}

function Step({ id, values, label, children }: StepProps): ReactElement {
  if (!id) {
    return (
      <span aria-disabled="true" className="text-faint">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={transactionDetailHref(id, values)}
      aria-label={label}
      className="font-medium text-ink-soft hover:underline"
    >
      {children}
    </Link>
  );
}

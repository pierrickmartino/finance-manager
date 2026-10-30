import type { BundledDetail } from '@/server/services/imports/parsers';

interface BundledDetailsProps {
  details: readonly BundledDetail[];
  /** Formats a detail amount (minor units) in the Transaction's Currency. */
  formatAmount: (amountMinor: number) => string;
}

/**
 * The payment details a bank bundled into one entry (ADR-0003). Shown for information only: the
 * Transaction is the entry total.
 */
export function BundledDetails({ details, formatAmount }: BundledDetailsProps) {
  return (
    <details className="text-xs text-zinc-600 dark:text-zinc-400">
      <summary className="cursor-pointer">{details.length} bundled payments</summary>
      <ul aria-label="Bundled payments" className="mt-1 flex flex-col gap-1">
        {details.map((detail, index) => (
          <li key={index} className="flex flex-wrap gap-x-3">
            <span>{detail.counterpartyName ?? '—'}</span>
            {detail.amountMinor !== null && (
              <span className="tabular-nums">{formatAmount(detail.amountMinor)}</span>
            )}
            {detail.paymentReference && <span>{detail.paymentReference}</span>}
            {detail.counterpartyIban && (
              <span className="font-mono">{detail.counterpartyIban}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

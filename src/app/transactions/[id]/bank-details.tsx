import type { ReactNode } from 'react';
import { BundledDetails } from '@/components/bundled-details';
import type { Formatter } from '@/lib/format';
import type { TransactionDetail } from '@/server/services/transactions';

interface BankDetailsProps {
  transaction: TransactionDetail;
  fmt: Formatter;
  /** Classes of the section, e.g. to draw it as a card. */
  className?: string;
}

/**
 * Every bank field read-only (spec 38) that the header does not already show, and the payments
 * the bank bundled into the entry (spec 28), for information only.
 */
export function BankDetails({ transaction, fmt, className }: BankDetailsProps) {
  const bundled = transaction.bundledDetails ?? [];
  const source = transaction.import
    ? `Import of ${transaction.import.fileName} on ${fmt.date(transaction.import.importedAt)}`
    : 'Manual';
  return (
    <section aria-labelledby="bank-fields" className={className}>
      <h2 id="bank-fields" className="text-lg font-semibold">
        {transaction.isManual ? 'Details' : 'From the bank'}
      </h2>
      <dl
        aria-label="Bank fields"
        className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm"
      >
        <Item term="Value date">{transaction.valueDate && fmt.date(transaction.valueDate)}</Item>
        <Item term="Description">
          <span className="font-mono text-xs whitespace-pre-wrap">
            {transaction.rawDescription}
          </span>
        </Item>
        <Item term="Counterparty">{transaction.counterpartyName}</Item>
        <Item term="Counterparty IBAN">
          {transaction.counterpartyIban && (
            <span className="font-mono">{transaction.counterpartyIban}</span>
          )}
        </Item>
        <Item term="Payment reference">{transaction.paymentReference}</Item>
        <Item term="Bank reference">{transaction.bankReference}</Item>
        <Item term="Source">{source}</Item>
      </dl>
      {bundled.length > 0 && (
        <BundledDetails
          details={bundled}
          formatAmount={(minor) => fmt.amount(minor, { currency: transaction.currency })}
        />
      )}
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{term}</dt>
      <dd className="break-words [overflow-wrap:anywhere]">{children || '—'}</dd>
    </>
  );
}

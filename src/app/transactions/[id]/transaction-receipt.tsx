import Link from 'next/link';
import type { ReactNode } from 'react';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { TransactionDetail } from '@/server/services/transactions';
import { amountClass, transactionName } from '../transaction-display';
import type { BadgeTone, StatusBadge } from './transaction-badges';

const CELL = 'px-3 py-2 text-left';

const TONE_CLASS: Record<BadgeTone, string> = {
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  positive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

interface TransactionReceiptProps {
  transaction: TransactionDetail;
  badges: StatusBadge[];
  fmt: Formatter;
}

/**
 * What happened, as a receipt: who, how much, when and on which Account, its status, then
 * every bank field read-only (spec 38) and the payments the bank bundled into it.
 */
export function TransactionReceipt({ transaction, badges, fmt }: TransactionReceiptProps) {
  const name = transactionName(transaction);
  return (
    <article aria-label="Transaction" className={`${CARD_CLASS} overflow-hidden`}>
      <header className="flex flex-col items-center gap-2 border-b border-dashed border-zinc-300 px-6 py-8 text-center dark:border-zinc-700">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 place-items-center rounded-full bg-zinc-100 text-xl font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="text-xl font-semibold break-words">{name}</h1>
        <p
          className={`text-4xl font-semibold tabular-nums ${amountClass(transaction.amountMinor)}`}
        >
          {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
        </p>
        <p className="text-sm text-zinc-500">
          {fmt.date(transaction.bookingDate)} ·{' '}
          <Link href={`/accounts/${transaction.accountId}`} className="underline">
            {transaction.accountName}
          </Link>
        </p>
        <ul aria-label="Status" className="flex flex-wrap justify-center gap-1.5">
          {badges.map((badge) => (
            <li
              key={badge.label}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[badge.tone]}`}
            >
              {badge.label}
            </li>
          ))}
        </ul>
      </header>
      <section aria-labelledby="bank-fields" className="flex flex-col gap-4 px-6 py-5">
        <h2 id="bank-fields" className="text-sm font-semibold text-zinc-500">
          {transaction.isManual ? 'Details' : 'From the bank'}
        </h2>
        <BankFields transaction={transaction} fmt={fmt} />
        {transaction.bundledDetails && transaction.bundledDetails.length > 0 && (
          <BundledDetails transaction={transaction} fmt={fmt} />
        )}
      </section>
    </article>
  );
}

interface FieldsProps {
  transaction: TransactionDetail;
  fmt: Formatter;
}

/** The bank fields the receipt's header does not already show. */
function BankFields({ transaction, fmt }: FieldsProps) {
  const source = transaction.import ? (
    <>
      Import of {transaction.import.fileName} on {fmt.date(transaction.import.importedAt)}
    </>
  ) : (
    'Manual'
  );
  return (
    <dl
      aria-label="Bank fields"
      className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm"
    >
      <Item term="Value date">{transaction.valueDate && fmt.date(transaction.valueDate)}</Item>
      <Item term="Description">
        <span className="font-mono text-xs whitespace-pre-wrap">{transaction.rawDescription}</span>
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
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{term}</dt>
      <dd className="break-words">{children || '—'}</dd>
    </>
  );
}

/** The payments a bank bundled into this one entry, for information only (spec 28). */
function BundledDetails({ transaction, fmt }: FieldsProps) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Bundled details" className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>Counterparty</th>
            <th className={CELL}>IBAN</th>
            <th className={CELL}>Reference</th>
            <th className={`${CELL} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {(transaction.bundledDetails ?? []).map((detail, index) => (
            <tr key={index}>
              <td className={CELL}>{detail.counterpartyName ?? '—'}</td>
              <td className={`${CELL} font-mono`}>{detail.counterpartyIban ?? '—'}</td>
              <td className={CELL}>{detail.paymentReference ?? '—'}</td>
              <td className={`${CELL} text-right tabular-nums`}>
                {detail.amountMinor === null
                  ? '—'
                  : fmt.amount(detail.amountMinor, { currency: transaction.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

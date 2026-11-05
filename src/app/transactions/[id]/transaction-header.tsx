import Link from 'next/link';
import type { ReactNode } from 'react';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { TransactionDetail } from '@/server/services/transactions';
import { amountClass, transactionName } from '../transaction-display';
import type { BadgeTone, StatusBadge } from './transaction-badges';

const TONE_CLASS: Record<BadgeTone, string> = {
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  positive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

interface TransactionHeaderProps {
  transaction: TransactionDetail;
  badges: StatusBadge[];
  fmt: Formatter;
  /** What can be done to the Transaction as a whole, e.g. edit its details or delete it. */
  actions: ReactNode;
}

/**
 * What happened, in one strip: who, when and on which Account, its status, how much, and the
 * actions on the whole Transaction. Kept short so the page's room goes to the work below it.
 */
export function TransactionHeader({ transaction, badges, fmt, actions }: TransactionHeaderProps) {
  const name = transactionName(transaction);
  return (
    <header
      aria-label="Transaction"
      className={`${CARD_CLASS} flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4`}
    >
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
        <h1 className="line-clamp-2 text-lg font-semibold break-words" title={name}>
          {name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-500">
          <span>
            {fmt.date(transaction.bookingDate)} ·{' '}
            <Link href={`/accounts/${transaction.accountId}`} className="underline">
              {transaction.accountName}
            </Link>
          </span>
          <ul aria-label="Status" className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <li
                key={badge.label}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[badge.tone]}`}
              >
                {badge.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p
        className={`text-2xl font-semibold whitespace-nowrap tabular-nums ${amountClass(transaction.amountMinor)}`}
      >
        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
      </p>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Formatter } from '@/lib/format';
import type { TransactionDetail } from '@/server/services/transactions';
import { amountClass, transactionName } from '../transaction-display';
import { TransactionMorph } from '../transaction-morph';
import {
  DETAIL_HEADER_CLASS,
  DETAIL_HEADER_INITIAL_CLASS,
  DETAIL_HEADER_TITLE_CLASS,
} from './detail-layout';
import type { BadgeTone, StatusBadge } from './transaction-badges';

const TONE_CLASS: Record<BadgeTone, string> = {
  warning: 'bg-warning-tint text-warning',
  info: 'bg-info-tint text-info',
  positive: 'bg-positive-tint text-positive',
  neutral: 'bg-sunken text-ink-soft',
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
    <TransactionMorph transactionId={transaction.id} part="detail">
      <header aria-label="Transaction" className={DETAIL_HEADER_CLASS}>
        <span
          aria-hidden="true"
          className={`${DETAIL_HEADER_INITIAL_CLASS} grid place-items-center bg-sunken text-lg font-semibold text-ink-soft`}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className={DETAIL_HEADER_TITLE_CLASS}>
          <h1 className="line-clamp-2 text-lg font-semibold break-words" title={name}>
            {name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
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
                  className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[badge.tone]}`}
                >
                  {badge.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p
          className={`font-display text-3xl tracking-tight whitespace-nowrap tabular-nums ${amountClass(transaction.amountMinor)}`}
        >
          {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
        </p>
        <div className="flex items-center gap-3">{actions}</div>
      </header>
    </TransactionMorph>
  );
}

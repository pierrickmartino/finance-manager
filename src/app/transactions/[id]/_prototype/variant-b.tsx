// PROTOTYPE variant B: receipt + workbench. Left: what happened (a receipt-style card of the
// bank facts, then History as a timeline). Right, sticky: what to do (classify, split,
// transfer, rule), so the job you came for never scrolls away.

import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import { SplitSection } from '../split-section';
import { TransferSection } from '../transfer-section';
import {
  amountText,
  Badge,
  BankFields,
  BundledDetailsTable,
  Classify,
  DeleteButton,
  displayName,
  EditDetailsLink,
  HistoryTimeline,
  LockedFields,
  RuleLink,
  statusBadges,
  type DetailProps,
} from './shared';

export const VARIANT_B_NAME = 'Receipt + workbench';

export function VariantB(props: DetailProps) {
  const { transaction, fmt } = props;
  const isIncome = transaction.amountMinor > 0;
  return (
    <section className="flex flex-col gap-4">
      <Link href="/transactions" className="text-sm text-zinc-500 hover:underline">
        ← Transactions
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        {/* Left: the facts */}
        <div className="flex min-w-0 flex-col gap-6">
          <article className={`${CARD_CLASS} overflow-hidden`}>
            <div className="flex flex-col items-center gap-2 border-b border-dashed border-zinc-300 px-6 py-8 text-center dark:border-zinc-700">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-zinc-100 text-xl font-semibold dark:bg-zinc-800">
                {displayName(transaction).slice(0, 1).toUpperCase()}
              </span>
              <h1 className="text-xl font-semibold">{displayName(transaction)}</h1>
              <p
                className={`text-4xl font-semibold tabular-nums ${isIncome ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
              >
                {amountText(props)}
              </p>
              <p className="text-sm text-zinc-500">
                {fmt.date(transaction.bookingDate)} ·{' '}
                <Link href={`/accounts/${transaction.accountId}`} className="underline">
                  {transaction.accountName}
                </Link>
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {statusBadges(props).map((badge) => (
                  <Badge key={badge.label} {...badge} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <BankFields {...props} dense />
              <BundledDetailsTable {...props} />
            </div>
          </article>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">History</h2>
            <HistoryTimeline {...props} />
          </section>
        </div>

        {/* Right: the work */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <div className={`${CARD_CLASS} flex flex-col gap-3 p-5`}>
            <h2 className="font-semibold">Classify</h2>
            <Classify {...props} />
            <LockedFields {...props} />
            <RuleLink {...props} />
          </div>
          <div className={`${CARD_CLASS} p-5`}>
            <SplitSection transaction={transaction} groups={props.groups} fmt={fmt} />
          </div>
          <div className={`${CARD_CLASS} p-5`}>
            <TransferSection
              transactionId={transaction.id}
              counterpart={props.counterpart}
              options={props.linkOptions}
              fmt={fmt}
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <EditDetailsLink {...props} />
            <DeleteButton
              {...props}
              className="text-sm font-medium text-rose-600 hover:underline"
            />
          </div>
        </aside>
      </div>
    </section>
  );
}

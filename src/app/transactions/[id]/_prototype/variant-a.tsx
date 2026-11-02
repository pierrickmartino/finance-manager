// PROTOTYPE variant A: today's layout (one column of stacked sections), as the baseline.

import Link from 'next/link';
import { SplitSection } from '../split-section';
import { TransferSection } from '../transfer-section';
import {
  amountText,
  BankFields,
  BundledDetailsTable,
  Classify,
  DeleteButton,
  EditDetailsLink,
  HistoryBlock,
  LockedFields,
  RuleLink,
  type DetailProps,
} from './shared';

export const VARIANT_A_NAME = 'Current: stacked sections';

export function VariantA(props: DetailProps) {
  const { transaction, fmt } = props;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/transactions" className="text-sm text-zinc-500 hover:underline">
          ← Transactions
        </Link>
        <h1 className="text-2xl font-semibold">
          {transaction.rawDescription || '(no description)'}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="tabular-nums">{amountText(props)}</span> on{' '}
          {fmt.date(transaction.bookingDate)} ·{' '}
          <Link href={`/accounts/${transaction.accountId}`} className="underline">
            {transaction.accountName}
          </Link>
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {transaction.isManual ? 'Details' : 'From the bank'}
        </h2>
        <BankFields {...props} />
        <BundledDetailsTable {...props} />
      </section>

      <TransferSection
        transactionId={transaction.id}
        counterpart={props.counterpart}
        options={props.linkOptions}
        fmt={fmt}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Classification</h2>
        <Classify {...props} />
        <LockedFields {...props} />
        <p>
          <RuleLink {...props} />
        </p>
      </section>

      <SplitSection transaction={transaction} groups={props.groups} fmt={fmt} />

      <div className="flex items-start gap-3">
        <EditDetailsLink {...props} />
        <DeleteButton {...props} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">History</h2>
        <HistoryBlock {...props} />
      </section>
    </section>
  );
}

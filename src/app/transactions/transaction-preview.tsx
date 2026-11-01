import Link from 'next/link';
import type { ReactNode } from 'react';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { TransactionListItem } from '@/server/services/transactions';
import { amountClass, CategoryLabel, transactionName } from './transaction-display';

interface TransactionPreviewProps {
  fmt: Formatter;
  transaction: TransactionListItem;
}

/** Read-only summary of the selected row, beside the list from `xl` up. */
export function TransactionPreview({ fmt, transaction }: TransactionPreviewProps) {
  return (
    <aside
      aria-label="Transaction preview"
      className={`${CARD_CLASS} hidden h-fit flex-col gap-4 p-4 xl:sticky xl:top-4 xl:flex`}
    >
      <div>
        <p className="text-xs text-zinc-500">
          {fmt.date(transaction.bookingDate)} · {transaction.accountName}
        </p>
        <p
          className={`mt-1 text-3xl font-semibold tabular-nums ${amountClass(transaction.amountMinor)}`}
        >
          {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
        </p>
        <p className="mt-1 font-medium break-words">{transactionName(transaction)}</p>
      </div>
      <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        <Field label="Category" value={<CategoryLabel transaction={transaction} />} />
        <Field label="Payee" value={transaction.payee?.name} />
        <Field label="Tags" value={transaction.tags.map((tag) => tag.name).join(', ')} />
        <Field label="Counterparty" value={transaction.counterpartyName} />
        <Field
          label="IBAN"
          value={
            transaction.counterpartyIban && (
              <span className="font-mono text-xs">{transaction.counterpartyIban}</span>
            )
          }
        />
        <Field label="Reference" value={transaction.paymentReference} />
        <Field label="Source" value={transaction.isManual ? 'Manual' : 'Imported'} />
      </dl>
      <p className="rounded-md bg-zinc-50 p-2 font-mono text-xs break-words text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        {transaction.rawDescription || '(no description)'}
      </p>
      {transaction.notes && <p className="text-sm whitespace-pre-line">{transaction.notes}</p>}
      <Link
        href={`/transactions/${transaction.id}`}
        className={`${PRIMARY_BUTTON_CLASS} text-center`}
      >
        Open & classify
      </Link>
    </aside>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-right break-words">{value || '—'}</dd>
    </div>
  );
}

import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { Account } from '@/server/services/accounts';
import type { Transaction } from '@/server/services/transactions/model';
import { createManualTransactionAction } from './actions';
import { ManualTransactionForm } from './manual-transaction-form';

const CELL = 'px-3 py-2 text-left';

interface ManualTransactionsSectionProps {
  account: Account;
  transactions: Transaction[];
  fmt: Formatter;
  /** Today in Swiss time: the quick-entry form's first date. */
  today: string;
}

/** Quick entry and the list of an Account's Manual transactions (spec 39–40). */
export function ManualTransactionsSection({
  account,
  transactions,
  fmt,
  today,
}: ManualTransactionsSectionProps) {
  const { currency } = account;
  return (
    <section aria-labelledby="manual-transactions" className="flex flex-col gap-3">
      <h2 id="manual-transactions" className="text-lg font-semibold">
        Manual transactions
      </h2>
      {!account.archivedAt && (
        <ManualTransactionForm
          action={createManualTransactionAction.bind(null, account.id)}
          currency={currency}
          submitLabel="Add"
          defaultDate={transactions.at(-1)?.bookingDate ?? today}
        />
      )}
      {transactions.length === 0 ? (
        <p className="text-sm text-zinc-500">No Manual transactions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Manual transactions" className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={CELL}>Date</th>
                <th className={CELL}>Description</th>
                <th className={CELL}>Counterparty</th>
                <th className={`${CELL} text-right`}>Amount</th>
                <th className={CELL}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className={CELL}>{fmt.date(transaction.bookingDate)}</td>
                  <td className={CELL}>{transaction.rawDescription}</td>
                  <td className={CELL}>{transaction.counterpartyName}</td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    {fmt.amount(transaction.amountMinor, { currency })}
                  </td>
                  <td className={CELL}>
                    {!account.archivedAt && (
                      <Link
                        href={`/accounts/${account.id}/manual/${transaction.id}`}
                        aria-label={`Edit ${transaction.rawDescription} (${fmt.date(transaction.bookingDate)})`}
                        className="underline"
                      >
                        Edit
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

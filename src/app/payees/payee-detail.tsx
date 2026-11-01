import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Menu } from '@/components/menu';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, DANGER_BUTTON_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { Payee } from '@/server/services/payees';
import type { TransactionListItem } from '@/server/services/transactions';
import { deletePayeeAction, mergePayeeAction, renamePayeeAction } from './actions';

interface PayeeDetailProps {
  payee: Payee;
  /** Every Payee, to merge into. */
  payees: Payee[];
  /** Its latest Transactions, newest first. */
  recent: TransactionListItem[];
  fmt: Formatter;
}

function transactionsLabel(count: number): string {
  return `${count} Transaction${count === 1 ? '' : 's'}`;
}

/** The detail pane: one Payee's header and edits, and its latest Transactions. */
export function PayeeDetail({ payee, payees, recent, fmt }: PayeeDetailProps) {
  const { id, name, transactionCount } = payee;
  const transactionsHref = `/transactions?payeeId=${id}`;
  return (
    <section aria-label={`Payee ${name}`} className={`${CARD_CLASS} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="truncate text-lg font-semibold">{name}</h2>
          <Link href={transactionsHref} className="text-sm text-zinc-400 hover:underline">
            {transactionsLabel(transactionCount)}
          </Link>
          {transactionCount === 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950 dark:text-amber-300">
              Unused
            </span>
          )}
        </div>
        <PayeeMenu payee={payee} payees={payees} />
      </div>

      <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
        Recent Transactions
      </h3>
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-400">
          No Transactions. An unused Payee can be deleted from Edit Payee.
        </p>
      ) : (
        <ul
          aria-label={`Recent Transactions of ${name}`}
          className="divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          {recent.map((transaction) => (
            <RecentRow key={transaction.id} transaction={transaction} fmt={fmt} />
          ))}
        </ul>
      )}
      {transactionCount > recent.length && (
        <Link
          href={transactionsHref}
          className="border-t border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          All {transactionsLabel(transactionCount)} →
        </Link>
      )}
    </section>
  );
}

function RecentRow({ transaction, fmt }: { transaction: TransactionListItem; fmt: Formatter }) {
  const classification = transaction.transferId
    ? 'Transfer'
    : (transaction.category?.name ?? 'Unclassified');
  return (
    <li className="flex items-center gap-4 px-4 py-2.5 text-sm">
      <span className="w-24 shrink-0 text-zinc-500 tabular-nums">
        {fmt.date(transaction.bookingDate)}
      </span>
      <Link
        href={`/transactions/${transaction.id}`}
        className="min-w-0 flex-1 truncate hover:underline"
      >
        {transaction.rawDescription || '(no description)'}
        <span className="block truncate text-xs text-zinc-400">
          {transaction.accountName} · {classification}
        </span>
      </Link>
      <span
        className={`shrink-0 tabular-nums ${transaction.amountMinor > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
      >
        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
      </span>
    </li>
  );
}

/** Rename, merge and delete, behind one menu. */
function PayeeMenu({ payee, payees }: { payee: Payee; payees: Payee[] }) {
  const { id, name, transactionCount } = payee;
  const others = payees.filter((other) => other.id !== id);
  return (
    <Menu trigger="Edit Payee" triggerClassName={GHOST_BUTTON_CLASS}>
      <ActionForm action={renamePayeeAction.bind(null, id)} label={`Rename ${name}`}>
        <input
          name="name"
          aria-label={`Name of ${name}`}
          defaultValue={name}
          required
          maxLength={100}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <button type="submit" className={GHOST_BUTTON_CLASS}>
          Rename
        </button>
      </ActionForm>
      {others.length > 0 && (
        <ActionForm
          action={mergePayeeAction.bind(null, id)}
          label={`Merge ${name}`}
          confirmMessage={`Move every Transaction of "${name}" to the chosen Payee and delete "${name}"?`}
        >
          <select
            name="targetId"
            aria-label={`Merge ${name} into`}
            required
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          >
            <option value="">Merge into…</option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
          <button type="submit" className={GHOST_BUTTON_CLASS}>
            Merge
          </button>
        </ActionForm>
      )}
      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {transactionCount === 0 ? (
          <ActionForm
            action={deletePayeeAction.bind(null, id)}
            label={`Delete ${name}`}
            confirmMessage={`Delete "${name}"?`}
          >
            <button type="submit" className={DANGER_BUTTON_CLASS}>
              Delete Payee
            </button>
          </ActionForm>
        ) : (
          <p className="text-xs text-zinc-500">
            A Payee with Transactions can&apos;t be deleted; merge it into another instead.
          </p>
        )}
      </div>
    </Menu>
  );
}

import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import type { CandidateTransaction } from '@/server/services/transfers';
import { linkTransferAction, unlinkTransferAction } from './actions';

interface TransferSectionProps {
  transactionId: string;
  /** The other side when the Transaction is in a Transfer. */
  counterpart: CandidateTransaction | null;
  /** Transactions it may be linked with, when it is not in a Transfer. */
  options: CandidateTransaction[];
  fmt: Formatter;
}

const describe = (transaction: CandidateTransaction, fmt: Formatter): string =>
  `${transaction.accountName} · ${fmt.date(transaction.bookingDate)} · ${fmt.amount(
    transaction.amountMinor,
    { currency: transaction.currency },
  )} · ${transaction.counterpartyName ?? transaction.rawDescription}`;

/** The Transfer this Transaction is in, with Unlink; or a form to link it by hand (spec 88). */
export function TransferSection({
  transactionId,
  counterpart,
  options,
  fmt,
}: TransferSectionProps) {
  return (
    <section aria-labelledby="transfer" className="flex flex-col gap-3">
      <h2 id="transfer" className="text-lg font-semibold">
        Transfer
      </h2>
      {counterpart ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Transfer with{' '}
            <Link href={`/transactions/${counterpart.id}`} className="underline">
              {describe(counterpart, fmt)}
            </Link>
            . A Transfer has no Category and is left out of income and expense.
          </p>
          <ActionForm
            action={unlinkTransferAction.bind(null, transactionId)}
            label="Unlink Transfer"
            confirmMessage="Unlink this Transfer? Both Transactions stay."
          >
            <button type="submit" className={BUTTON_CLASS}>
              Unlink Transfer
            </button>
          </ActionForm>
        </div>
      ) : options.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Not a Transfer. No Transaction on another Account with the opposite sign is near enough to
          link.
        </p>
      ) : (
        <ActionForm action={linkTransferAction.bind(null, transactionId)} label="Link as Transfer">
          <label className="flex flex-col gap-1 text-sm">
            Other side
            <select
              name="otherId"
              className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {describe(option, fmt)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={BUTTON_CLASS}>
            Link as Transfer
          </button>
        </ActionForm>
      )}
    </section>
  );
}

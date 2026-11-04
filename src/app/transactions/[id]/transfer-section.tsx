import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import type { TransferSideRef, TransferSideView } from '@/server/services/transfers';
import { linkTransferAction, unlinkTransferAction } from './actions';

interface TransferSectionProps {
  transactionId: string;
  /** The other side when the Transaction is in a Transfer. */
  counterpart: TransferSideView | null;
  /** Sides it may be linked with, when it is not in a Transfer. */
  options: TransferSideView[];
  fmt: Formatter;
  /** Classes of the section, e.g. to draw it as a card. */
  className?: string;
}

/**
 * A Transfer side in one line: its Account, date, amount and text; a Split line is named as
 * a line of its Transaction (ADR-0005).
 */
export function describeSide(side: TransferSideView, fmt: Formatter): string {
  const { transaction } = side;
  const amount = (minor: number) => fmt.amount(minor, { currency: transaction.currency });
  const text = transaction.counterpartyName ?? transaction.rawDescription;
  const date = fmt.date(transaction.bookingDate);
  if (side.kind === 'transaction') {
    return `${transaction.accountName} · ${date} · ${amount(side.amountMinor)} · ${text}`;
  }
  return `a Split line of ${amount(side.amountMinor)} of ${transaction.accountName} · ${date} · ${amount(
    transaction.amountMinor,
  )} · ${text}`;
}

/** "Transfer with <the other side>", linking to the other side's Transaction. */
export function TransferCounterpart({
  counterpart,
  fmt,
}: {
  counterpart: TransferSideView;
  fmt: Formatter;
}) {
  return (
    <>
      Transfer with{' '}
      <Link href={`/transactions/${counterpart.transaction.id}`} className="underline">
        {describeSide(counterpart, fmt)}
      </Link>
    </>
  );
}

/** The value of a link option in the picker: `kind:id`. */
export const sideOptionValue = ({ kind, id }: TransferSideRef): string => `${kind}:${id}`;

interface LinkTransferFormProps {
  /** The Transaction whose page this is. */
  transactionId: string;
  /** The side being linked: the Transaction itself or one of its Split lines. */
  side: TransferSideRef;
  options: TransferSideView[];
  fmt: Formatter;
  /** Accessible name of the form. */
  label: string;
}

/** A picker of the other side, and Link as Transfer (spec 88). */
export function LinkTransferForm({
  transactionId,
  side,
  options,
  fmt,
  label,
}: LinkTransferFormProps) {
  return (
    <ActionForm action={linkTransferAction.bind(null, transactionId, side)} label={label}>
      <label className="flex flex-col gap-1 text-sm">
        Other side
        <select
          name="otherSide"
          className="w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {options.map((option) => (
            <option key={sideOptionValue(option)} value={sideOptionValue(option)}>
              {describeSide(option, fmt)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={BUTTON_CLASS}>
        Link as Transfer
      </button>
    </ActionForm>
  );
}

/** The Transfer this Transaction is in, with Unlink; or a form to link it by hand (spec 88). */
export function TransferSection({
  transactionId,
  counterpart,
  options,
  fmt,
  className = 'flex flex-col gap-3',
}: TransferSectionProps) {
  return (
    <section aria-labelledby="transfer" className={className}>
      <h2 id="transfer" className="text-lg font-semibold">
        Transfer
      </h2>
      {counterpart ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <TransferCounterpart counterpart={counterpart} fmt={fmt} />. A Transfer has no Category
            and is left out of income and expense.
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
        <LinkTransferForm
          transactionId={transactionId}
          side={{ kind: 'transaction', id: transactionId }}
          options={options}
          fmt={fmt}
          label="Link as Transfer"
        />
      )}
    </section>
  );
}

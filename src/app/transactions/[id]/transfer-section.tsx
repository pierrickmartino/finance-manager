import type { Formatter } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { GuardedLink } from '@/components/unsaved-changes';
import { BUTTON_CLASS } from '@/components/named-list';
import {
  sideOptionValue,
  transactionSide,
  type TransferSideKind,
  type TransferSideRef,
  type TransferSideView,
} from '@/server/services/transfers';
import { linkTransferAction, unlinkTransferAction } from './actions';
import { SECTION_TITLE_CLASS } from '@/components/surface';

interface TransferSectionProps {
  transactionId: string;
  /** The other side when the Transaction is in a Transfer. */
  counterpart: TransferSideView | null;
  /** Sides it may be linked with, when it is not in a Transfer. */
  options: TransferSideView[];
  fmt: Formatter;
  /** The other side's detail, within the detail's Transactions list if any (ADR-0013). */
  counterpartHref: (transactionId: string) => string;
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

interface TransferCounterpartProps {
  counterpart: TransferSideView;
  fmt: Formatter;
  /** The other side's Transaction detail, within the list the detail was opened from if any. */
  href: string;
}

/**
 * "Transfer with <the other side>", linking to the other side's Transaction. Following it asks
 * before discarding unsaved edits, like every way off a Transaction detail.
 */
export function TransferCounterpart({ counterpart, fmt, href }: TransferCounterpartProps) {
  return (
    <>
      Transfer with{' '}
      <GuardedLink href={href} className="underline">
        {describeSide(counterpart, fmt)}
      </GuardedLink>
    </>
  );
}

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
          className="w-full min-w-0 rounded-md border border-rule-strong px-2 py-1.5"
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

interface UnlinkTransferFormProps {
  /** The Transaction whose page this is. */
  transactionId: string;
  /** The linked side: the Transaction itself or one of its Split lines. */
  side: TransferSideRef;
  /** Accessible name of the form. */
  label: string;
}

const UNLINK_CONFIRM: Record<TransferSideKind, string> = {
  transaction: 'Unlink this Transfer? Both sides stay.',
  splitLine:
    'Unlink this Transfer? Both sides stay, and this Split line is left without a Category.',
};

/** Unlink Transfer, after a confirmation: both sides stay, unlinked (ADR-0005). */
export function UnlinkTransferForm({ transactionId, side, label }: UnlinkTransferFormProps) {
  return (
    <ActionForm
      action={unlinkTransferAction.bind(null, transactionId, side)}
      label={label}
      confirmMessage={UNLINK_CONFIRM[side.kind]}
    >
      <button type="submit" className={BUTTON_CLASS}>
        Unlink Transfer
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
  counterpartHref,
  className = 'flex flex-col gap-3',
}: TransferSectionProps) {
  return (
    <section aria-labelledby="transfer" className={className}>
      <h2 id="transfer" className={SECTION_TITLE_CLASS}>
        Transfer
      </h2>
      {counterpart ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <TransferCounterpart
              counterpart={counterpart}
              fmt={fmt}
              href={counterpartHref(counterpart.transaction.id)}
            />
            . A Transfer has no Category and is left out of income and expense.
          </p>
          <UnlinkTransferForm
            transactionId={transactionId}
            side={transactionSide(transactionId)}
            label="Unlink Transfer"
          />
        </div>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted">
          Not a Transfer. No Transaction or Split line on another Account with the opposite sign is
          near enough to link.
        </p>
      ) : (
        <LinkTransferForm
          transactionId={transactionId}
          side={transactionSide(transactionId)}
          options={options}
          fmt={fmt}
          label="Link as Transfer"
        />
      )}
    </section>
  );
}

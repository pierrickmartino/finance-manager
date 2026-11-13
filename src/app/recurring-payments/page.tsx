import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import {
  CARD_CLASS,
  HEADLINE_AMOUNT_CLASS,
  PAGE_TITLE_CLASS,
  SMALL_BUTTON_CLASS,
} from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { swissToday } from '@/server/services/fx/dates';
import {
  AMOUNT_TOLERANCE,
  CADENCES,
  listRecurringPayments,
  WINDOW_MONTHS,
  type RecurringPayment,
} from '@/server/services/recurring-payments';
import { dismissRecurringPaymentAction, restoreRecurringPaymentAction } from './actions';
import { aroundDate, cadenceLabel, minimumChargesText, yearlyCostWorking } from './view';

export const metadata: Metadata = { title: 'Recurring payments · Finance Manager' };

/**
 * The Recurring payments page (spec: Recurring payments; ADR-0011): the series recognised from
 * recorded Transactions as of today, with the total of their yearly costs, highest first.
 * Dismissed ones sit in a collapsed section below, out of the total, where they can be restored.
 */
export default async function RecurringPaymentsPage() {
  const ctx = await getServiceContext();
  const today = swissToday();
  const [list, fmt] = await Promise.all([listRecurringPayments(ctx, { today }), getFormatter()]);
  const { totalYearlyCostMinor } = list;
  const recurringPayments = list.recurringPayments.filter(
    (payment) => payment.dismissalId === null,
  );
  const dismissed = list.recurringPayments.filter((payment) => payment.dismissalId !== null);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Recurring payments</h1>
        <p className="text-sm text-muted">
          Recognised from your recorded expenses. Nothing is scheduled or entered in advance.
        </p>
      </header>

      {list.recurringPayments.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section aria-label="Yearly cost" className="flex flex-col gap-1">
            <p className="text-sm text-muted">Yearly cost</p>
            <p className={HEADLINE_AMOUNT_CLASS}>
              {fmt.amount(totalYearlyCostMinor, { currency: 'CHF' })}
            </p>
            <p className="text-sm text-muted">
              {recurringPayments.length} Recurring payment
              {recurringPayments.length === 1 ? '' : 's'}
            </p>
          </section>
          <ul aria-label="Recurring payments" className={`${CARD_CLASS} divide-y divide-rule`}>
            {recurringPayments.map((payment) => (
              <PaymentRow
                key={paymentKey(payment)}
                payment={payment}
                today={today}
                fmt={fmt}
                action={<DismissButton payment={payment} />}
              />
            ))}
          </ul>
          <DismissedSection payments={dismissed} today={today} fmt={fmt} />
        </>
      )}
    </section>
  );
}

/** A series has no stored id: its first charge names it. */
const paymentKey = (payment: RecurringPayment): string =>
  `${payment.charges[0]!.kind}:${payment.charges[0]!.id}`;

interface PaymentRowProps {
  payment: RecurringPayment;
  today: string;
  fmt: Formatter;
  /** The row's Dismiss or Restore button. */
  action: ReactNode;
}

function PaymentRow({ payment, today, fmt, action }: PaymentRowProps) {
  return (
    <li className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-baseline">
      <div className="min-w-0">
        <p className="truncate font-medium">{payment.payee.name}</p>
        <p className="text-sm text-muted">
          {cadenceLabel(payment.cadence)} · last{' '}
          <span className="tabular-nums">
            {fmt.amount(payment.lastAmountMinor, { currency: payment.currency })}
          </span>
        </p>
      </div>
      <p className="text-sm text-muted sm:text-right">
        Next {aroundDate(payment.nextExpectedDate, today)}
      </p>
      <div className="sm:text-right">
        {payment.yearlyCost ? (
          <p className="font-medium tabular-nums">
            {fmt.amount(payment.yearlyCost.amountMinor, { currency: 'CHF' })}
            <span className="text-sm font-normal text-muted"> a year</span>
          </p>
        ) : (
          <p className="text-sm text-muted">No FX rate yet</p>
        )}
        <p className="text-xs text-muted tabular-nums">{yearlyCostWorking(payment, fmt)}</p>
      </div>
      <div className="sm:text-right">{action}</div>
    </li>
  );
}

function DismissButton({ payment }: { payment: RecurringPayment }) {
  const charges = payment.charges.map(({ kind, id }) => ({ kind, id }));
  return (
    <ActionForm
      action={dismissRecurringPaymentAction.bind(null, charges)}
      label={`Dismiss ${payment.payee.name}`}
    >
      <button type="submit" className={SMALL_BUTTON_CLASS}>
        Dismiss
      </button>
    </ActionForm>
  );
}

function RestoreButton({ payment }: { payment: RecurringPayment }) {
  return (
    <ActionForm
      action={restoreRecurringPaymentAction.bind(null, payment.dismissalId!)}
      label={`Restore ${payment.payee.name}`}
    >
      <button type="submit" className={SMALL_BUTTON_CLASS}>
        Restore
      </button>
    </ActionForm>
  );
}

interface DismissedSectionProps {
  payments: RecurringPayment[];
  today: string;
  fmt: Formatter;
}

/** The dismissed series, collapsed: out of the total, each with a Restore button. */
function DismissedSection({ payments, today, fmt }: DismissedSectionProps) {
  if (payments.length === 0) return null;
  return (
    <section aria-label="Dismissed" className={`${CARD_CLASS} py-2.5 text-sm`}>
      <details>
        <summary className="cursor-pointer px-4 text-muted">Dismissed ({payments.length})</summary>
        <ul aria-label="Dismissed Recurring payments" className="mt-2 divide-y divide-rule">
          {payments.map((payment) => (
            <PaymentRow
              key={paymentKey(payment)}
              payment={payment}
              today={today}
              fmt={fmt}
              action={<RestoreButton payment={payment} />}
            />
          ))}
        </ul>
      </details>
    </section>
  );
}

function EmptyState() {
  return (
    <div className={`${CARD_CLASS} flex flex-col gap-2 px-4 py-6 text-sm`}>
      <p className="font-medium">No Recurring payments recognised yet.</p>
      <p className="text-muted">
        A Recurring payment is a Payee&apos;s expense of a similar amount (within{' '}
        {AMOUNT_TOLERANCE * 100}% of the previous charge) booked every month, quarter, half-year or
        year, from {minimumChargesText(CADENCES)} in the last {WINDOW_MONTHS} months. Only
        Transactions and Split lines classified under an Expense Category and with a Payee count.
      </p>
    </div>
  );
}

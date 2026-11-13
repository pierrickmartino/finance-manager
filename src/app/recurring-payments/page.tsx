import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import {
  BADGE_CLASS,
  CARD_CLASS,
  HEADLINE_AMOUNT_CLASS,
  PAGE_TITLE_CLASS,
  SMALL_BUTTON_CLASS,
} from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { plural } from '@/lib/reporting/drill-summary';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { swissToday } from '@/server/services/fx/dates';
import {
  AMOUNT_TOLERANCE,
  CADENCES,
  chargeKey,
  ENDED_AFTER_CADENCES,
  listRecurringPayments,
  WINDOW_MONTHS,
  type RecurringPayment,
  type RecurringPaymentList,
} from '@/server/services/recurring-payments';
import { dismissRecurringPaymentAction, restoreRecurringPaymentAction } from './actions';
import {
  aroundDate,
  badgesOf,
  cadenceLabel,
  drillHref,
  minimumChargesText,
  sectionsOf,
  yearlyCostWorking,
} from './view';

export const metadata: Metadata = { title: 'Recurring payments · Finance Manager' };

/**
 * The Recurring payments page (spec: Recurring payments; ADR-0011): the series recognised from
 * recorded Transactions as of today, highest yearly cost first, with the total of the active,
 * Missed and Not yet imported ones. Below, collapsed and out of the total: the Ended ones, and the
 * dismissed ones (Ended or not), where they can be restored.
 */
export default async function RecurringPaymentsPage() {
  const ctx = await getServiceContext();
  const today = swissToday();
  const [list, fmt] = await Promise.all([listRecurringPayments(ctx, { today }), getFormatter()]);
  const isEmpty = list.recurringPayments.length === 0 && list.ended.length === 0;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Recurring payments</h1>
        <p className="text-sm text-muted">
          Recognised from your recorded expenses. Nothing is scheduled or entered in advance.
        </p>
      </header>
      {isEmpty ? <EmptyState /> : <PaymentSections list={list} today={today} fmt={fmt} />}
    </section>
  );
}

/** What every row needs to say when and how much. */
interface RowContext {
  today: string;
  fmt: Formatter;
}

interface PaymentSectionsProps extends RowContext {
  list: RecurringPaymentList;
}

/** The total, the listed series, then the collapsed Ended and Dismissed sections. */
function PaymentSections({ list, today, fmt }: PaymentSectionsProps) {
  const { recurringPayments, ended, dismissed } = sectionsOf(list);
  return (
    <>
      <section aria-label="Yearly cost" className="flex flex-col gap-1">
        <p className="text-sm text-muted">Yearly cost</p>
        <p className={HEADLINE_AMOUNT_CLASS}>
          {fmt.amount(list.totalYearlyCostMinor, { currency: BASE_CURRENCY })}
        </p>
        <p className="text-sm text-muted">
          {plural(recurringPayments.length, 'Recurring payment')}
        </p>
      </section>
      {recurringPayments.length > 0 && (
        <ul aria-label="Recurring payments" className={`${CARD_CLASS} divide-y divide-rule`}>
          <PaymentRows payments={recurringPayments} today={today} fmt={fmt} action="dismiss" />
        </ul>
      )}
      {ended.length > 0 && <EndedSection ended={ended} today={today} fmt={fmt} />}
      <DismissedSection payments={dismissed} today={today} fmt={fmt} />
    </>
  );
}

/** A series has no stored id: its first charge names it. */
const paymentKey = (payment: RecurringPayment): string => chargeKey(payment.charges[0]!);

interface PaymentRowsProps extends RowContext {
  payments: RecurringPayment[];
  /** The button each row has: Dismiss, or Restore for a dismissed series. */
  action: 'dismiss' | 'restore';
}

function PaymentRows({ payments, action, today, fmt }: PaymentRowsProps) {
  return payments.map((payment) => (
    <PaymentRow
      key={paymentKey(payment)}
      payment={payment}
      today={today}
      fmt={fmt}
      action={
        action === 'dismiss' ? (
          <DismissButton payment={payment} />
        ) : (
          <RestoreButton payment={payment} />
        )
      }
    />
  ));
}

interface EndedSectionProps extends RowContext {
  ended: RecurringPayment[];
}

/** The Ended series, collapsed: a native disclosure, no client script. */
function EndedSection({ ended, today, fmt }: EndedSectionProps) {
  return (
    <section aria-label="Ended" className={`${CARD_CLASS} text-sm`}>
      <details>
        <summary className="cursor-pointer px-4 py-3 font-medium">Ended ({ended.length})</summary>
        <p className="px-4 pb-3 text-muted">
          No charge for {ENDED_AFTER_CADENCES} full cadences. Left out of the yearly cost; a new
          charge makes one active again.
        </p>
        <ul
          aria-label="Ended Recurring payments"
          className="divide-y divide-rule border-t border-rule"
        >
          <PaymentRows payments={ended} today={today} fmt={fmt} action="dismiss" />
        </ul>
      </details>
    </section>
  );
}

interface DismissedSectionProps extends RowContext {
  payments: RecurringPayment[];
}

/** The dismissed series, collapsed: out of the total, each with a Restore button. */
function DismissedSection({ payments, today, fmt }: DismissedSectionProps) {
  if (payments.length === 0) return null;
  return (
    <section aria-label="Dismissed" className={`${CARD_CLASS} py-2.5 text-sm`}>
      <details>
        <summary className="cursor-pointer px-4 text-muted">Dismissed ({payments.length})</summary>
        <ul aria-label="Dismissed Recurring payments" className="mt-2 divide-y divide-rule">
          <PaymentRows payments={payments} today={today} fmt={fmt} action="restore" />
        </ul>
      </details>
    </section>
  );
}

interface PaymentProps {
  payment: RecurringPayment;
  fmt: Formatter;
}

interface PaymentRowProps extends PaymentProps, RowContext {
  /** The row's Dismiss or Restore button. */
  action: ReactNode;
}

function PaymentRow({ payment, today, fmt, action }: PaymentRowProps) {
  return (
    <li className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-baseline">
      <PaymentSummary payment={payment} fmt={fmt} />
      <p className="text-sm text-muted sm:text-right">
        {payment.state === 'ended' ? (
          <>Last charged {fmt.date(payment.lastChargeDate)}</>
        ) : (
          <>Next {aroundDate(payment.nextExpectedDate, today)}</>
        )}
      </p>
      <YearlyCost payment={payment} fmt={fmt} />
      <div className="sm:text-right">{action}</div>
    </li>
  );
}

/** The Payee, linking to the Drill-down, its cadence and last amount, and its badges. */
function PaymentSummary({ payment, fmt }: PaymentProps) {
  const badges = payment.state === 'ended' ? [] : badgesOf(payment, fmt);
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">
        <Link href={drillHref(payment)} className="hover:underline">
          {payment.payee.name}
        </Link>
      </p>
      <p className="text-sm text-muted">
        {cadenceLabel(payment.cadence)} · last{' '}
        <span className="tabular-nums">
          {fmt.amount(payment.lastAmountMinor, { currency: payment.currency })}
        </span>
      </p>
      {badges.length > 0 && (
        <ul aria-label="Flags" className="mt-1 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li key={badge.label} className={BADGE_CLASS[badge.tone]}>
              {badge.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The yearly cost in CHF, or "No FX rate yet", with how it was worked out. */
function YearlyCost({ payment, fmt }: PaymentProps) {
  return (
    <div className="sm:text-right">
      {payment.yearlyCost ? (
        <p className="font-medium tabular-nums">
          {fmt.amount(payment.yearlyCost.amountMinor, { currency: BASE_CURRENCY })}
          <span className="text-sm font-normal text-muted"> a year</span>
        </p>
      ) : (
        <p className="text-sm text-muted">No FX rate yet</p>
      )}
      <p className="text-xs text-muted tabular-nums">{yearlyCostWorking(payment, fmt)}</p>
    </div>
  );
}

interface PaymentButtonProps {
  payment: RecurringPayment;
}

function DismissButton({ payment }: PaymentButtonProps) {
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

function RestoreButton({ payment }: PaymentButtonProps) {
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

import type { Metadata } from 'next';
import Link from 'next/link';
import { CARD_CLASS, HEADLINE_AMOUNT_CLASS, PAGE_TITLE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { swissToday } from '@/server/services/fx/dates';
import {
  AMOUNT_TOLERANCE,
  CADENCES,
  ENDED_AFTER_CADENCES,
  listRecurringPayments,
  WINDOW_MONTHS,
  type RecurringPayment,
} from '@/server/services/recurring-payments';
import {
  aroundDate,
  badgesOf,
  cadenceLabel,
  drillHref,
  minimumChargesText,
  yearlyCostWorking,
  type Badge,
} from './view';

export const metadata: Metadata = { title: 'Recurring payments · Finance Manager' };

/**
 * The Recurring payments page (spec: Recurring payments; ADR-0011): the series recognised from
 * recorded Transactions as of today, highest yearly cost first, with the total of the active and
 * Missed ones; the Ended ones in a collapsed section below, out of the total.
 */
export default async function RecurringPaymentsPage() {
  const ctx = await getServiceContext();
  const today = swissToday();
  const [list, fmt] = await Promise.all([listRecurringPayments(ctx, { today }), getFormatter()]);
  const { recurringPayments, ended, totalYearlyCostMinor } = list;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Recurring payments</h1>
        <p className="text-sm text-muted">
          Recognised from your recorded expenses. Nothing is scheduled or entered in advance.
        </p>
      </header>

      {recurringPayments.length === 0 && ended.length === 0 ? (
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
          {recurringPayments.length > 0 && (
            <ul aria-label="Recurring payments" className={`${CARD_CLASS} divide-y divide-rule`}>
              {recurringPayments.map((payment) => (
                <PaymentRow key={keyOf(payment)} payment={payment} today={today} fmt={fmt} />
              ))}
            </ul>
          )}
          {ended.length > 0 && <EndedSection ended={ended} today={today} fmt={fmt} />}
        </>
      )}
    </section>
  );
}

function keyOf(payment: RecurringPayment): string {
  return `${payment.charges[0]!.kind}:${payment.charges[0]!.id}`;
}

/** The Ended series, collapsed: a native disclosure, no client script. */
function EndedSection({
  ended,
  today,
  fmt,
}: {
  ended: RecurringPayment[];
  today: string;
  fmt: Formatter;
}) {
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
          {ended.map((payment) => (
            <PaymentRow key={keyOf(payment)} payment={payment} today={today} fmt={fmt} />
          ))}
        </ul>
      </details>
    </section>
  );
}

const BADGE_CLASS = {
  warning:
    'rounded-md bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/20 ring-inset',
  info: 'rounded-md bg-info-tint px-2 py-0.5 text-xs text-info',
} as const satisfies Record<Badge['tone'], string>;

interface PaymentRowProps {
  payment: RecurringPayment;
  today: string;
  fmt: Formatter;
}

function PaymentRow({ payment, today, fmt }: PaymentRowProps) {
  const badges = payment.state === 'ended' ? [] : badgesOf(payment, fmt);
  return (
    <li className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-baseline">
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
      <p className="text-sm text-muted sm:text-right">
        {payment.state === 'ended' ? (
          <>Last charged {fmt.date(payment.lastChargeDate)}</>
        ) : (
          <>Next {aroundDate(payment.nextExpectedDate, today)}</>
        )}
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
    </li>
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

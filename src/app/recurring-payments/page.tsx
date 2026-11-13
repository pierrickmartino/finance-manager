import type { Metadata } from 'next';
import { CARD_CLASS, HEADLINE_AMOUNT_CLASS, PAGE_TITLE_CLASS } from '@/components/surface';
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
import { aroundDate, cadenceLabel, minimumChargesText, yearlyCostWorking } from './view';

export const metadata: Metadata = { title: 'Recurring payments · Finance Manager' };

/**
 * The Recurring payments page (spec: Recurring payments; ADR-0011): the series recognised from
 * recorded Transactions as of today, with the total of their yearly costs, highest first.
 */
export default async function RecurringPaymentsPage() {
  const ctx = await getServiceContext();
  const today = swissToday();
  const [list, fmt] = await Promise.all([listRecurringPayments(ctx, { today }), getFormatter()]);
  const { recurringPayments, totalYearlyCostMinor } = list;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Recurring payments</h1>
        <p className="text-sm text-muted">
          Recognised from your recorded expenses. Nothing is scheduled or entered in advance.
        </p>
      </header>

      {recurringPayments.length === 0 ? (
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
                key={`${payment.charges[0]!.kind}:${payment.charges[0]!.id}`}
                payment={payment}
                today={today}
                fmt={fmt}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface PaymentRowProps {
  payment: RecurringPayment;
  today: string;
  fmt: Formatter;
}

function PaymentRow({ payment, today, fmt }: PaymentRowProps) {
  return (
    <li className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-baseline">
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

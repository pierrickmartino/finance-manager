import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { splitLabel } from '@/app/transactions/transaction-display';
import { PAGE_TITLE_CLASS } from '@/components/surface';
import { categoryLabel } from '@/lib/classification';
import type { Formatter } from '@/lib/format';
import { backLink, RECURRING_PAYMENT } from '@/lib/reporting/drill-origin';
import { plural } from '@/lib/reporting/drill-summary';
import type { UrlParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { NotFoundError } from '@/server/services/errors';
import { swissToday } from '@/server/services/fx/dates';
import {
  listRecurringPaymentCharges,
  type ChargeRef,
  type RecurringPaymentDrill,
} from '@/server/services/recurring-payments';
import type { TransactionListItem } from '@/server/services/transactions';
import { chargeFromParams } from '../view';

export const metadata: Metadata = { title: 'Drill-down · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

/** The series `charge` is in, as of today; a 404 once no Recurring payment has that charge. */
async function loadDrill(charge: ChargeRef | null): Promise<RecurringPaymentDrill> {
  if (!charge) notFound();
  try {
    return await listRecurringPaymentCharges(await getServiceContext(), {
      today: swissToday(),
      charge,
    });
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/**
 * A Recurring payment's Drill-down (spec: Recurring payments): the Transactions it was recognised
 * from, so the user can check what the series is made of, with the way back to the page.
 */
export default async function RecurringPaymentDrillPage({
  searchParams,
}: {
  searchParams: Promise<UrlParams>;
}) {
  const charge = chargeFromParams(await searchParams);
  const [{ recurringPayment, transactions }, fmt] = await Promise.all([
    loadDrill(charge),
    getFormatter(),
  ]);
  const back = backLink(RECURRING_PAYMENT);
  const last = fmt.amount(recurringPayment.lastAmountMinor, {
    currency: recurringPayment.currency,
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className={PAGE_TITLE_CLASS}>Charges of {recurringPayment.payee.name}</h1>
        <Link href={back.href} className="text-sm underline">
          {back.label}
        </Link>
      </div>
      <p role="status" className="text-lg text-ink tabular-nums">
        {plural(recurringPayment.charges.length, 'charge')} · last {last}
      </p>
      <ChargeTable transactions={transactions} fmt={fmt} />
    </section>
  );
}

/** The Transactions of the charges, newest first; a split one shows its whole Amount. */
function ChargeTable({
  transactions,
  fmt,
}: {
  transactions: TransactionListItem[];
  fmt: Formatter;
}) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Drill-down Transactions" className="w-full text-sm">
        <thead className="border-b border-rule">
          <tr>
            <th className={CELL}>Date</th>
            <th className={CELL}>Account</th>
            <th className={CELL}>Description</th>
            <th className={CELL}>Payee</th>
            <th className={CELL}>Category</th>
            <th className={`${CELL} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                {fmt.date(transaction.bookingDate)}
              </td>
              <td className={CELL}>{transaction.accountName}</td>
              <td className={CELL}>
                <Link href={`/transactions/${transaction.id}`} className="hover:underline">
                  {transaction.rawDescription || '(no description)'}
                </Link>
              </td>
              <td className={CELL}>{transaction.payee?.name ?? '—'}</td>
              <td className={CELL}>
                {transaction.category
                  ? categoryLabel(transaction.category)
                  : (splitLabel(transaction) ?? 'Unclassified')}
              </td>
              <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

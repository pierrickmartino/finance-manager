import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackTo, DrillTable } from '@/app/widgets/drill/drill-table';
import { PAGE_TITLE_CLASS } from '@/components/surface';
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
import { chargeFromParams } from '../view';

export const metadata: Metadata = { title: 'Drill-down · Finance Manager' };

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

interface RecurringPaymentDrillPageProps {
  searchParams: Promise<UrlParams>;
}

/**
 * A Recurring payment's Drill-down (spec: Recurring payments): the Transactions it was recognised
 * from, so the user can check what the series is made of, with the way back to the page.
 */
export default async function RecurringPaymentDrillPage({
  searchParams,
}: RecurringPaymentDrillPageProps) {
  const charge = chargeFromParams(await searchParams);
  const [{ recurringPayment, transactions }, fmt] = await Promise.all([
    loadDrill(charge),
    getFormatter(),
  ]);
  const last = fmt.amount(recurringPayment.lastAmountMinor, {
    currency: recurringPayment.currency,
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className={PAGE_TITLE_CLASS}>Charges of {recurringPayment.payee.name}</h1>
        <BackTo {...backLink(RECURRING_PAYMENT)} />
      </div>
      <p role="status" className="text-lg text-ink tabular-nums">
        {plural(recurringPayment.charges.length, 'charge')} · last {last}
      </p>
      {/* Newest first; a split Transaction shows its whole Amount. */}
      <DrillTable transactions={transactions} fmt={fmt} />
    </section>
  );
}

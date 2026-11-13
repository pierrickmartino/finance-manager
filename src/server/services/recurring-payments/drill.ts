import { z } from 'zod';
import type { ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import { listTransactionsByIds, type TransactionListItem } from '../transactions';
import type { Charge } from './charges';
import { listRecurringPayments, type RecurringPayment } from './list';

/** A Recurring payment's Drill-down: the series and the Transactions of its charges. */
export interface RecurringPaymentDrill {
  recurringPayment: RecurringPayment;
  /** Newest first; a Transaction with several charging Split lines is listed once. */
  transactions: TransactionListItem[];
}

/**
 * One of a series' charges: series are not stored, so a charge is how a series is named. The
 * kind is a plain string, as it comes from a URL; it only ever matches a real charge's.
 */
export interface ChargeRef {
  kind: string;
  id: string;
}

const drillInput = z.object({
  today: z.iso.date(),
  charge: z.object({ kind: z.string().min(1).max(32), id: z.uuid() }),
});

/** The Transactions of `charges` (oldest first), newest first and each once. */
function transactionIdsOf(charges: readonly Charge[]): string[] {
  return [...new Set(charges.toReversed().map((charge) => charge.transactionId))];
}

/**
 * The Drill-down of the Recurring payment recognised as of `today` that `charge` is one of
 * (spec: Recurring payments), whatever its state (Ended ones too): its charges' Transactions,
 * through the list-by-id read. Not found when no Recurring payment has that charge, e.g. once it
 * is no longer recognised.
 */
export async function listRecurringPaymentCharges(
  ctx: ServiceContext,
  input: { today: string; charge: ChargeRef },
): Promise<RecurringPaymentDrill> {
  const { today, charge } = parseInput(drillInput, input);
  const { recurringPayments, ended } = await listRecurringPayments(ctx, { today });
  const recurringPayment = [...recurringPayments, ...ended].find((payment) =>
    payment.charges.some((one) => one.kind === charge.kind && one.id === charge.id),
  );
  if (!recurringPayment) throw new NotFoundError('Recurring payment not found');
  const transactions = await listTransactionsByIds(ctx, transactionIdsOf(recurringPayment.charges));
  return { recurringPayment, transactions };
}

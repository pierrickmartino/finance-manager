import { z } from 'zod';
import type { ServiceContext } from '../context';
import {
  chargeKey,
  listRecurringPayments,
  type RecurringPayment,
  type RecurringPaymentList,
} from '../recurring-payments';
import { attentionKind, type AttentionTone } from './kind';

/** A Missed Recurring payment: its Payee, and the date its charge was expected. */
export interface MissedAttentionItem {
  kind: 'missed';
  /** The Recurring payment, as `subjectsOf` names it. */
  subject: string;
  payeeName: string;
  /** The next expected date that passed, grace and all, with no charge. */
  expectedDate: string;
  href: '/recurring-payments';
  tone: AttentionTone;
}

/** A Recurring payment whose latest charge is dearer than the one before. */
export interface PriceIncreaseAttentionItem {
  kind: 'price-increase';
  /** The Recurring payment, as `subjectsOf` names it. */
  subject: string;
  payeeName: string;
  /** The Currency of its charges, which the amounts are in. */
  currency: string;
  /** The charge before the latest, in minor units (positive). */
  previousAmountMinor: number;
  /** The latest charge, in minor units (positive). */
  lastAmountMinor: number;
  /** The latest charge, as `chargeKey` names it: the one that went up. */
  lastCharge: string;
  href: '/recurring-payments';
  tone: AttentionTone;
}

const HREF = '/recurring-payments';

/**
 * Names each Recurring payment by its Payee, Currency and cadence: series are not stored
 * (ADR-0011), and these stay the same through a price change and as charges come and go out of
 * the recognition window, where any one charge would not. Two series sharing them (the same
 * Payee charging two amounts) are told apart by their first charge. A Payee merge renames the
 * subject; the item is then unread once, which is harmless.
 */
function subjectsOf(payments: readonly RecurringPayment[]): Map<RecurringPayment, string> {
  const base = (payment: RecurringPayment) =>
    [payment.payee.id, payment.currency, payment.cadence].join('|');
  const counts = Map.groupBy(payments, base);
  return new Map(
    payments.map((payment) => {
      const key = base(payment);
      const isShared = (counts.get(key)?.length ?? 0) > 1;
      return [payment, isShared ? `${key}|${chargeKey(payment.charges[0]!)}` : key];
    }),
  );
}

/** The Recurring payment lists being worked out, by context and day: see `recurringPaymentsOn`. */
const inFlight = new WeakMap<ServiceContext, Map<string, Promise<RecurringPaymentList>>>();

/**
 * The Recurring payment list on `today`. Missed and Price increase are listed side by side from
 * one list: while it is being worked out, the other kind waits for the same one instead of
 * recognising every series again. Nothing is kept once it is done (ADR-0019: no cache).
 */
function recurringPaymentsOn(ctx: ServiceContext, today: string): Promise<RecurringPaymentList> {
  const byDay = inFlight.get(ctx) ?? new Map<string, Promise<RecurringPaymentList>>();
  inFlight.set(ctx, byDay);
  const pending = byDay.get(today);
  if (pending) return pending;
  const list = listRecurringPayments(ctx, { today }).finally(() => byDay.delete(today));
  byDay.set(today, list);
  return list;
}

/**
 * The Recurring payments the bell lists, with their subjects: the ones neither Ended, "Not yet
 * imported" nor Dismissed. "Not yet imported" is its Account's Stale or Gap item already; New
 * alone gives no item either.
 */
async function listedPayments(
  ctx: ServiceContext,
  today: string,
): Promise<{ payment: RecurringPayment; subject: string }[]> {
  const { recurringPayments } = await recurringPaymentsOn(ctx, today);
  const subjects = subjectsOf(recurringPayments);
  return recurringPayments
    .filter((payment) => payment.dismissalId === null && payment.state !== 'not_yet_imported')
    .map((payment) => ({ payment, subject: subjects.get(payment)! }));
}

/** Its form is the expected date: Missed again on a later one got worse. */
export const missedKind = attentionKind<MissedAttentionItem, string>({
  async list(ctx, today) {
    const payments = await listedPayments(ctx, today);
    return payments
      .filter(({ payment }) => payment.state === 'missed')
      .map(({ payment, subject }) => ({
        kind: 'missed',
        subject,
        payeeName: payment.payee.name,
        expectedDate: payment.nextExpectedDate,
        href: HREF,
        tone: 'warning',
      }));
  },
  form: (item) => item.expectedDate,
  formSchema: z.iso.date(),
  gotWorse: (now, seen) => now > seen,
});

/**
 * Its form is the last charge: a Price increase on another charge is a new one, so unread. It
 * goes away by itself with the next charge, unless that one is dearer again.
 */
export const priceIncreaseKind = attentionKind<PriceIncreaseAttentionItem, string>({
  async list(ctx, today) {
    const payments = await listedPayments(ctx, today);
    return payments
      .filter(({ payment }) => payment.flags.includes('price_increase'))
      .map(({ payment, subject }) => ({
        kind: 'price-increase',
        subject,
        payeeName: payment.payee.name,
        currency: payment.currency,
        previousAmountMinor: payment.previousAmountMinor,
        lastAmountMinor: payment.lastAmountMinor,
        lastCharge: chargeKey(payment.charges.at(-1)!),
        href: HREF,
        tone: 'warning',
      }));
  },
  form: (item) => item.lastCharge,
  formSchema: z.string(),
  gotWorse: (now, seen) => now !== seen,
});

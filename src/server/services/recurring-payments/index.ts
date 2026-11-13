import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { loadRateTable, toChfMinor, type ChfValue, type RateTable } from '../fx';
import { chargesPerYear, WINDOW_MONTHS, type Cadence } from './cadences';
import { loadCharges, type Charge } from './charges';
import { addMonths } from './dates';
import { recogniseSeries, type RecognisedSeries } from './recognise';

export {
  AMOUNT_TOLERANCE,
  CADENCES,
  INTERVAL_TOLERANCE,
  WINDOW_MONTHS,
  type Cadence,
  type CadenceRule,
} from './cadences';
export type { Charge, ChargeKind } from './charges';
export { listRecurringPaymentCharges, type ChargeRef, type RecurringPaymentDrill } from './drill';

/**
 * Where a Recurring payment stands. Only `active` for now; Missed, "Not yet imported", Ended
 * (#130) and Dismissed (#132) join here.
 */
export type RecurringPaymentState = 'active';

/** A Recurring payment (GLOSSARY): one recognised series of a Payee's charges. */
export interface RecurringPayment {
  payee: { id: string; name: string };
  /** The Currency of its charges, which its amounts are in. */
  currency: string;
  cadence: Cadence;
  chargesPerYear: number;
  /** The latest charge, in minor units of `currency` (positive). */
  lastAmountMinor: number;
  /** The charge before the latest, in minor units of `currency` (positive). */
  previousAmountMinor: number;
  lastChargeDate: string;
  /** The last charge's date plus the cadence in calendar months, clamped to the month's end. */
  nextExpectedDate: string;
  /**
   * The last amount × charges per year, in CHF at the rate on the last charge's date or the most
   * recent earlier one (ADR-0002), with that rate; null when no rate exists yet.
   */
  yearlyCost: ChfValue | null;
  state: RecurringPaymentState;
  /** The charges it was recognised from, oldest first. */
  charges: Charge[];
}

export interface RecurringPaymentList {
  /** Highest yearly cost first; a series with no FX rate yet comes last. */
  recurringPayments: RecurringPayment[];
  /** The sum of the listed yearly costs, in CHF minor units (a series with no rate adds 0). */
  totalYearlyCostMinor: number;
}

const listInput = z.object({ today: z.iso.date() });

function yearlyCostOf(
  rates: RateTable,
  currency: string,
  lastAmountMinor: number,
  perYear: number,
  date: string,
): ChfValue | null {
  const rate = rates.rateOn(currency, date);
  if (!rate) return null;
  return { amountMinor: toChfMinor(lastAmountMinor * perYear, currency, rate.rateToChf), rate };
}

function toRecurringPayment(series: RecognisedSeries, rates: RateTable): RecurringPayment {
  const last = series.charges.at(-1)!;
  const previous = series.charges.at(-2)!;
  const perYear = chargesPerYear(series.rule);
  return {
    payee: series.payee,
    currency: series.currency,
    cadence: series.rule.cadence,
    chargesPerYear: perYear,
    lastAmountMinor: last.amountMinor,
    previousAmountMinor: previous.amountMinor,
    lastChargeDate: last.bookingDate,
    nextExpectedDate: addMonths(last.bookingDate, series.rule.months),
    yearlyCost: yearlyCostOf(rates, series.currency, last.amountMinor, perYear, last.bookingDate),
    state: 'active',
    charges: series.charges.map(
      ({ kind, id, transactionId, accountId, bookingDate, amountMinor }) => ({
        kind,
        id,
        transactionId,
        accountId,
        bookingDate,
        amountMinor,
      }),
    ),
  };
}

function byYearlyCost(a: RecurringPayment, b: RecurringPayment): number {
  const costA = a.yearlyCost?.amountMinor ?? -1;
  const costB = b.yearlyCost?.amountMinor ?? -1;
  return costB - costA || a.payee.name.localeCompare(b.payee.name);
}

/**
 * The Recurring payments recognised from the `WINDOW_MONTHS` months of Transactions up to
 * `today` (spec: Recurring payments; ADR-0011). Computed on each call, never stored; `today` is
 * passed in, the clock is never read.
 */
export async function listRecurringPayments(
  ctx: ServiceContext,
  input: { today: string },
): Promise<RecurringPaymentList> {
  const { today } = parseInput(listInput, input);
  const from = addMonths(today, -WINDOW_MONTHS);
  const charges = await loadCharges(ctx.db, { from, to: today });
  const series = recogniseSeries(charges);
  const rates = await loadRateTable(ctx, {
    currencies: [...new Set(series.map((one) => one.currency))],
    from,
    to: today,
  });
  const recurringPayments = series
    .map((one) => toRecurringPayment(one, rates))
    .toSorted(byYearlyCost);
  const totalYearlyCostMinor = recurringPayments.reduce(
    (sum, payment) => sum + (payment.yearlyCost?.amountMinor ?? 0),
    0,
  );
  return { recurringPayments, totalYearlyCostMinor };
}

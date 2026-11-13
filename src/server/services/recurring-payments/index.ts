import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { loadRateTable, toChfMinor, type ChfValue, type RateTable } from '../fx';
import { chargesPerYear, WINDOW_MONTHS, type Cadence } from './cadences';
import { loadCharges, type Charge } from './charges';
import { loadAccountData, type AccountData } from './account-data';
import { addMonths } from './dates';
import { recogniseSeries, type RecognisedSeries } from './recognise';
import { flagsOf, stateOf, type RecurringPaymentFlag, type RecurringPaymentState } from './states';

export {
  AMOUNT_TOLERANCE,
  CADENCES,
  INTERVAL_TOLERANCE,
  WINDOW_MONTHS,
  type Cadence,
} from './cadences';
export type { Charge, ChargeKind } from './charges';
export {
  ENDED_AFTER_CADENCES,
  NEW_WITHIN_DAYS,
  type RecurringPaymentFlag,
  type RecurringPaymentState,
} from './states';

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
  /** What changed: a price increase shows until the next charge; New while it started recently. */
  flags: RecurringPaymentFlag[];
  /** The charges it was recognised from, oldest first. */
  charges: Charge[];
}

export interface RecurringPaymentList {
  /** The series not Ended: highest yearly cost first; a series with no FX rate yet comes last. */
  recurringPayments: RecurringPayment[];
  /** The Ended series, in the same order. */
  ended: RecurringPayment[];
  /**
   * The sum of the yearly costs of `recurringPayments` (active and Missed), in CHF minor units;
   * a series with no rate adds 0 and Ended series are left out.
   */
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

/** What a series is judged against: FX rates, each imported Account's data, and today. */
interface Context {
  rates: RateTable;
  accountData: ReadonlyMap<string, AccountData>;
  today: string;
}

function toRecurringPayment(
  series: RecognisedSeries,
  { rates, accountData, today }: Context,
): RecurringPayment {
  const last = series.charges.at(-1)!;
  const previous = series.charges.at(-2)!;
  const perYear = chargesPerYear(series.rule);
  const nextExpectedDate = addMonths(last.bookingDate, series.rule.months);
  return {
    payee: series.payee,
    currency: series.currency,
    cadence: series.rule.cadence,
    chargesPerYear: perYear,
    lastAmountMinor: last.amountMinor,
    previousAmountMinor: previous.amountMinor,
    lastChargeDate: last.bookingDate,
    nextExpectedDate,
    yearlyCost: yearlyCostOf(rates, series.currency, last.amountMinor, perYear, last.bookingDate),
    state: stateOf({
      rule: series.rule,
      lastChargeDate: last.bookingDate,
      nextExpectedDate,
      accountData: accountData.get(last.accountId),
      today,
    }),
    flags: flagsOf({
      lastAmountMinor: last.amountMinor,
      previousAmountMinor: previous.amountMinor,
      firstChargeDate: series.charges[0]!.bookingDate,
      today,
    }),
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
  const [rates, accountData] = await Promise.all([
    loadRateTable(ctx, {
      currencies: [...new Set(series.map((one) => one.currency))],
      from,
      to: today,
    }),
    loadAccountData(ctx),
  ]);
  const all = series
    .map((one) => toRecurringPayment(one, { rates, accountData, today }))
    .toSorted(byYearlyCost);
  const recurringPayments = all.filter((payment) => payment.state !== 'ended');
  const totalYearlyCostMinor = recurringPayments.reduce(
    (sum, payment) => sum + (payment.yearlyCost?.amountMinor ?? 0),
    0,
  );
  return {
    recurringPayments,
    ended: all.filter((payment) => payment.state === 'ended'),
    totalYearlyCostMinor,
  };
}

import { daysBetween } from '../fx/dates';
import { CADENCES, continuesAmount, fitsInterval, type CadenceRule } from './cadences';
import type { LoadedCharge } from './charges';
import { isEndedOn } from './states';

/** A run of one Payee's charges in one Currency, each within the amount tolerance of the last. */
export interface ChargeSeries {
  payee: { id: string; name: string };
  currency: string;
  /** Oldest first. */
  charges: LoadedCharge[];
}

/** A series whose gaps fit a cadence, with enough charges for it. */
export interface RecognisedSeries extends ChargeSeries {
  rule: CadenceRule;
}

/**
 * Splits one Payee's charges in one Currency (oldest first) into series by amount: a charge
 * continues the series whose previous charge is closest in amount, within the tolerance, or
 * starts a new one.
 */
function seriesByAmount(charges: readonly LoadedCharge[]): LoadedCharge[][] {
  return charges.reduce<LoadedCharge[][]>((runs, charge) => {
    const candidates = runs
      .map((run, index) => ({ index, previous: run.at(-1)!.amountMinor }))
      .filter(({ previous }) => continuesAmount(previous, charge.amountMinor))
      .toSorted(
        (a, b) =>
          Math.abs(a.previous - charge.amountMinor) - Math.abs(b.previous - charge.amountMinor),
      );
    const best = candidates[0];
    if (!best) return [...runs, [charge]];
    return runs.map((run, index) => (index === best.index ? [...run, charge] : run));
  }, []);
}

/** Groups charges (oldest first) by Payee and Currency, then into series by amount. */
export function groupIntoSeries(charges: readonly LoadedCharge[]): ChargeSeries[] {
  const groups = Map.groupBy(charges, (charge) => `${charge.payeeId}|${charge.currency}`);
  return [...groups.values()].flatMap((group) => {
    const { payeeId, payeeName, currency } = group[0]!;
    return seriesByAmount(group).map((run) => ({
      payee: { id: payeeId, name: payeeName },
      currency,
      charges: run,
    }));
  });
}

/**
 * Splits charges (oldest first) into stretches at each pause: a charge booked once the series
 * would have been Ended at this cadence starts a new stretch.
 */
function stretchesOf(rule: CadenceRule, charges: readonly LoadedCharge[]): LoadedCharge[][] {
  return charges.reduce<LoadedCharge[][]>((stretches, charge) => {
    const current = stretches.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || isEndedOn(rule, previous.bookingDate, charge.bookingDate)) {
      return [...stretches, [charge]];
    }
    return [...stretches.slice(0, -1), [...current, charge]];
  }, []);
}

function gapsFit(rule: CadenceRule, stretch: readonly LoadedCharge[]): boolean {
  return stretch
    .slice(1)
    .every((charge, index) =>
      fitsInterval(rule, daysBetween(stretch[index]!.bookingDate, charge.bookingDate)),
    );
}

/**
 * The charges of `charges` that a cadence recognises, from the first stretch with enough charges
 * whose gaps all fit it. Later stretches continue the series after it had Ended (it becomes
 * active again), and their gaps must fit too. Earlier stretches are left out: they were never a
 * Recurring payment. Null when no stretch qualifies or a later gap doesn't fit.
 */
function recognisedAt(rule: CadenceRule, charges: readonly LoadedCharge[]): LoadedCharge[] | null {
  const stretches = stretchesOf(rule, charges);
  const first = stretches.findIndex(
    (stretch) => stretch.length >= rule.minCharges && gapsFit(rule, stretch),
  );
  if (first === -1) return null;
  const kept = stretches.slice(first);
  return kept.every((stretch) => gapsFit(rule, stretch)) ? kept.flat() : null;
}

/** The first cadence that recognises the series, with the charges it keeps; null when none does. */
export function fitCadence(
  charges: readonly LoadedCharge[],
): { rule: CadenceRule; charges: LoadedCharge[] } | null {
  for (const rule of CADENCES) {
    const kept = recognisedAt(rule, charges);
    if (kept) return { rule, charges: kept };
  }
  return null;
}

/** The series among `charges` that are Recurring payments, each with its cadence. */
export function recogniseSeries(charges: readonly LoadedCharge[]): RecognisedSeries[] {
  return groupIntoSeries(charges).flatMap((series) => {
    const fit = fitCadence(series.charges);
    return fit ? [{ ...series, ...fit }] : [];
  });
}

import { daysBetween } from '../fx/dates';
import { CADENCES, continuesAmount, fitsInterval, type CadenceRule } from './cadences';
import type { LoadedCharge } from './charges';

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

/** The first cadence every gap of the series fits, with enough charges; null when none does. */
export function cadenceOf(charges: readonly LoadedCharge[]): CadenceRule | null {
  const gaps = charges
    .slice(1)
    .map((charge, index) => daysBetween(charges[index]!.bookingDate, charge.bookingDate));
  return (
    CADENCES.find(
      (rule) => charges.length >= rule.minCharges && gaps.every((gap) => fitsInterval(rule, gap)),
    ) ?? null
  );
}

/** The series among `charges` that are Recurring payments, each with its cadence. */
export function recogniseSeries(charges: readonly LoadedCharge[]): RecognisedSeries[] {
  return groupIntoSeries(charges).flatMap((series) => {
    const rule = cadenceOf(series.charges);
    return rule ? [{ ...series, rule }] : [];
  });
}

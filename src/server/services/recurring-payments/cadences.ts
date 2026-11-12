/**
 * The recognition thresholds of Recurring payments (spec: Recurring payments, Recognition).
 * Named constants, with no settings screen; changing them migrates nothing (ADR-0011).
 */

/** A recognised cadence. Each one is a row of `CADENCES`. */
export type Cadence = 'monthly';

export interface CadenceRule {
  cadence: Cadence;
  /** Calendar months between two charges: also what the next expected date adds. */
  months: number;
  /** The fewest charges a series needs to be recognised at this cadence. */
  minCharges: number;
}

/** The cadences recognised, tried in this order. */
export const CADENCES: readonly CadenceRule[] = [{ cadence: 'monthly', months: 1, minCharges: 3 }];

/** A charge continues a series when its amount is within this share of the previous charge's. */
export const AMOUNT_TOLERANCE = 0.2;
/** Every gap between a series' charges must be within this share of its cadence. */
export const INTERVAL_TOLERANCE = 0.2;
/** Recurring payments are recognised from this many months of Transactions before today. */
export const WINDOW_MONTHS = 36;

/** The average length of a calendar month in days (Gregorian year / 12). */
export const AVERAGE_MONTH_DAYS = 365.2425 / 12;

/** How many charges a cadence makes in a year (12 for monthly). */
export function chargesPerYear(rule: CadenceRule): number {
  return 12 / rule.months;
}

/** Whether a gap of `days` between two charges fits the cadence, within `INTERVAL_TOLERANCE`. */
export function fitsInterval(rule: CadenceRule, days: number): boolean {
  const expected = rule.months * AVERAGE_MONTH_DAYS;
  return Math.abs(days - expected) <= expected * INTERVAL_TOLERANCE;
}

/** Whether `amountMinor` continues a series whose previous charge was `previousMinor`. */
export function continuesAmount(previousMinor: number, amountMinor: number): boolean {
  return Math.abs(amountMinor - previousMinor) <= previousMinor * AMOUNT_TOLERANCE;
}

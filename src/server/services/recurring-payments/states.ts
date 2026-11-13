/**
 * The states and flags of a Recurring payment (spec: Recurring payments, States), worked out
 * from the cadence table so every cadence gets them alike. Pure: `today` is passed in, the clock
 * is never read. Named constants, with no settings screen (ADR-0011).
 */
import { STALE_AFTER_DAYS } from '../completeness';
import { addDays, daysBetween } from '../fx/dates';
import type { AccountData } from './account-data';
import { AVERAGE_MONTH_DAYS, type CadenceRule } from './cadences';
import { addMonths } from './dates';

/** The grace after a next expected date, as a share of the cadence. */
export const GRACE_SHARE = 0.25;
/** A series is Ended after this many full cadences with no charge. */
export const ENDED_AFTER_CADENCES = 2;
/** A series is New while its first charge is at most this many days before today. */
export const NEW_WITHIN_DAYS = 90;

/**
 * Where a Recurring payment stands. `missed`: overdue while its Account's data covers the grace;
 * `not_yet_imported`: overdue, but the data doesn't reach that far; `ended`: no charge for
 * `ENDED_AFTER_CADENCES` full cadences. Dismissal is apart from the state: see `dismissalId`.
 */
export type RecurringPaymentState = 'active' | 'missed' | 'not_yet_imported' | 'ended';

/** What changed about a Recurring payment: its price went up, or it started recently. */
export type RecurringPaymentFlag = 'price_increase' | 'new';

/**
 * The last day of the series' last full stretch of `ENDED_AFTER_CADENCES` cadences after
 * `lastChargeDate`: from the next day on, with no charge, the series is Ended.
 */
export function lastDayBeforeEnded(rule: CadenceRule, lastChargeDate: string): string {
  return addMonths(lastChargeDate, rule.months * ENDED_AFTER_CADENCES);
}

/** Whether a series last charged on `lastChargeDate` is Ended on `day`. */
export function isEndedOn(rule: CadenceRule, lastChargeDate: string, day: string): boolean {
  return day > lastDayBeforeEnded(rule, lastChargeDate);
}

/** A cadence's grace in whole days: `GRACE_SHARE` of its average length (8 days for monthly). */
export function graceDays(rule: CadenceRule): number {
  return Math.round(rule.months * AVERAGE_MONTH_DAYS * GRACE_SHARE);
}

interface StateInput {
  rule: CadenceRule;
  lastChargeDate: string;
  nextExpectedDate: string;
  /** The data of the last charge's Account; undefined when it is entered by hand. */
  accountData: AccountData | undefined;
  today: string;
}

/**
 * Where a series stands on `today`. Once the grace after its next expected date has passed with
 * no charge it is Missed, unless the last charge's Account's data doesn't cover every day from
 * that charge to the grace's end (the Account is Stale, its data ends sooner, or a Gap falls in
 * between): then it is "Not yet imported". After `ENDED_AFTER_CADENCES` cadences it is Ended.
 */
export function stateOf(series: StateInput): RecurringPaymentState {
  const { rule, lastChargeDate, today } = series;
  if (isEndedOn(rule, lastChargeDate, today)) return 'ended';
  const graceEnd = addDays(series.nextExpectedDate, graceDays(rule));
  if (today <= graceEnd) return 'active';
  return coversThrough(series.accountData, lastChargeDate, graceEnd, today)
    ? 'missed'
    : 'not_yet_imported';
}

/** Whether the data covers every day after `from` up to and including `to`. */
function coversThrough(
  data: AccountData | undefined,
  from: string,
  to: string,
  today: string,
): boolean {
  if (!data) return true;
  const { dataEnd, gaps } = data;
  const isStale = dataEnd === null || daysBetween(dataEnd, today) > STALE_AFTER_DAYS;
  if (isStale || dataEnd < to) return false;
  return !gaps.some((gap) => gap.to > from && gap.from <= to);
}

interface FlagInput {
  lastAmountMinor: number;
  previousAmountMinor: number;
  firstChargeDate: string;
  today: string;
}

/** The flags of a series, price increase first. */
export function flagsOf(series: FlagInput): RecurringPaymentFlag[] {
  const isPriceIncrease = series.lastAmountMinor > series.previousAmountMinor;
  const isNew = series.firstChargeDate >= addDays(series.today, -NEW_WITHIN_DAYS);
  return [
    ...(isPriceIncrease ? (['price_increase'] as const) : []),
    ...(isNew ? (['new'] as const) : []),
  ];
}

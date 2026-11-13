import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { NUMBER_FORMATS, type Formatter } from '@/lib/format';
import type {
  Cadence,
  RecurringPayment,
  RecurringPaymentFlag,
  RecurringPaymentState,
} from '@/server/services/recurring-payments';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * A next expected date as the page says it: "around 5 April", with the year when it is not
 * `today`'s ("around 2 January 2026"). The date is an estimate, so it is never written exactly.
 */
export function aroundDate(iso: string, today: string): string {
  const [year, month, day] = iso.split('-');
  const sameYear = year === today.slice(0, 4);
  return `around ${Number(day)} ${MONTHS[Number(month) - 1]}${sameYear ? '' : ` ${year}`}`;
}

/**
 * How a yearly cost was worked out: the last amount × charges per year ("CHF 21.90 × 12"), and,
 * for a series not in CHF, the FX rate applied ("EUR 9.99 × 12 at 0.93 CHF/EUR").
 */
export function yearlyCostWorking(
  payment: Pick<RecurringPayment, 'currency' | 'lastAmountMinor' | 'chargesPerYear' | 'yearlyCost'>,
  fmt: Formatter,
): string {
  const working = `${fmt.amount(payment.lastAmountMinor, { currency: payment.currency })} × ${payment.chargesPerYear}`;
  const rate = payment.yearlyCost?.rate;
  if (payment.currency === BASE_CURRENCY || !rate) return working;
  const { decimal } = NUMBER_FORMATS[fmt.settings.numberFormat];
  const rateText = rate.rateToChf.replace('.', decimal);
  return `${working} at ${rateText} ${BASE_CURRENCY}/${payment.currency}`;
}

const CADENCE_LABELS = { monthly: 'Monthly' } as const satisfies Record<Cadence, string>;

export function cadenceLabel(cadence: Cadence): string {
  return CADENCE_LABELS[cadence];
}

/** A short label beside a Recurring payment, in a meaning token: attention or neutral status. */
export interface Badge {
  label: string;
  tone: 'warning' | 'info';
}

const STATE_BADGES = {
  active: null,
  missed: { label: 'Missed', tone: 'warning' },
  not_yet_imported: { label: 'Not yet imported', tone: 'info' },
  ended: null,
} as const satisfies Record<RecurringPaymentState, Badge | null>;

function flagBadge(
  flag: RecurringPaymentFlag,
  payment: Pick<RecurringPayment, 'currency' | 'lastAmountMinor' | 'previousAmountMinor'>,
  fmt: Formatter,
): Badge {
  if (flag === 'new') return { label: 'New', tone: 'info' };
  const from = fmt.amount(payment.previousAmountMinor, { currency: payment.currency });
  const to = fmt.amount(payment.lastAmountMinor, { currency: payment.currency });
  return { label: `Up from ${from} to ${to}`, tone: 'warning' };
}

/** The badges of a Recurring payment: its state (Missed, "Not yet imported") first, then its flags. */
export function badgesOf(
  payment: Pick<
    RecurringPayment,
    'currency' | 'lastAmountMinor' | 'previousAmountMinor' | 'state' | 'flags'
  >,
  fmt: Formatter,
): Badge[] {
  const state = STATE_BADGES[payment.state];
  return [...(state ? [state] : []), ...payment.flags.map((flag) => flagBadge(flag, payment, fmt))];
}

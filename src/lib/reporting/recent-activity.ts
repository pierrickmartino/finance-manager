/*
 * The Dashboard's Recent activity card: one Transaction in the spotlight, the rest on a timeline
 * with how long ago each was booked.
 */

/** What the spotlight compares a Transaction by. */
export interface ActivityAmount {
  id: string;
  amountMinor: number;
  currency: string;
}

/** The Dashboard's Currency: the one amounts are compared in when the list mixes Currencies. */
const DASHBOARD_CURRENCY = 'CHF';

/** From this many days back, a booking date reads better as the date itself. */
const RELATIVE_DAY_LIMIT = 7;

/**
 * The Transaction of the largest size, income or expense, and the others in their order.
 * Sizes in different Currencies don't compare, so only the Transactions in CHF compete, else
 * those in the newest Transaction's Currency. A tie goes to the newer Transaction.
 */
export function spotlight<T extends ActivityAmount>(
  recent: readonly T[],
): { spotlit: T; rest: T[] } | null {
  const newest = recent[0];
  if (!newest) return null;
  const currency = recent.some((transaction) => transaction.currency === DASHBOARD_CURRENCY)
    ? DASHBOARD_CURRENCY
    : newest.currency;
  const spotlit = recent
    .filter((transaction) => transaction.currency === currency)
    .reduce((largest, transaction) =>
      Math.abs(transaction.amountMinor) > Math.abs(largest.amountMinor) ? transaction : largest,
    );
  return { spotlit, rest: recent.filter((transaction) => transaction !== spotlit) };
}

/**
 * How long ago a booking date was, in words ("Today", "3 days ago"), or null when it is a week
 * or more back, or in the future: the caller shows the date instead.
 */
export function relativeDay(daysAgo: number): string | null {
  if (daysAgo < 0 || daysAgo >= RELATIVE_DAY_LIMIT) return null;
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return `${daysAgo} days ago`;
}

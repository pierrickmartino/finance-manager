import type { Statement, StatementEntry } from './types.ts';

const isBooked = (e: StatementEntry): boolean => e.status === undefined || e.status === 'BOOK';

/**
 * True when the statement's own numbers agree: opening balance plus booked movements
 * equals the closing balance, and each running balance follows from the previous one.
 * Checks that need a missing balance (e.g. OFX has no opening balance) are skipped.
 */
export function reconciles(statement: Statement): boolean {
  const booked = statement.entries.filter(isBooked);
  const first = booked[0]?.bookingDate ?? '';
  const last = booked.at(-1)?.bookingDate ?? '';
  const chronological = first > last ? [...booked].reverse() : booked;

  let balance = statement.openingBalance;
  for (const entry of chronological) {
    if (balance !== undefined) balance += entry.amount;
    if (entry.runningBalance !== undefined) {
      if (balance !== undefined && balance !== entry.runningBalance) return false;
      balance = entry.runningBalance;
    }
  }
  if (statement.openingBalance === undefined || statement.closingBalance === undefined) return true;
  return balance === statement.closingBalance;
}

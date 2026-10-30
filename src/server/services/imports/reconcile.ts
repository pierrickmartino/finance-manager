import type { ParsedEntry, ParsedStatement } from './parsers';

/** A Statement balance compared with the balance the app computes. Minor units. */
export interface BalanceCheck {
  statementMinor: number;
  computedMinor: number;
  /** computed − statement: positive when the app would hold more than the bank says. */
  differenceMinor: number;
}

/** Where a running balance (UBS `Solde`) stops adding up: something is missing just before it. */
export interface RunningBalanceBreak {
  bankReference: string | null;
  bookingDate: string;
  /** The previous row's balance plus this row's amount. */
  expectedMinor: number;
  /** The balance the file states after this row. */
  statedMinor: number;
  differenceMinor: number;
  /** The row before the gap; null when the gap is before the first row. */
  previous: { bankReference: string | null; bookingDate: string } | null;
}

export interface Reconciliation {
  status: 'ok' | 'mismatch';
  /**
   * The Statement opening balance against the Account's computed balance at the start of the
   * period. Null on an Account with no history (the opening balance is proposed instead) or
   * when the file has no balances at all.
   */
  opening: BalanceCheck | null;
  /** Balance at period end + new Transactions against the closing Statement balance. */
  closing: BalanceCheck | null;
  runningBalanceBreaks: RunningBalanceBreak[];
}

/** What the Account already holds, as reconciliation needs it. */
export interface AccountBalances {
  hasTransactions: boolean;
  /** Computed balance before the first day of the period (opening + earlier Transactions). */
  balanceBeforePeriodMinor: number;
  /** Computed balance at the end of the period's last day, without this file's new entries. */
  balanceAtPeriodEndMinor: number;
}

function check(statementMinor: number, computedMinor: number): BalanceCheck {
  return { statementMinor, computedMinor, differenceMinor: computedMinor - statementMinor };
}

function sum(entries: readonly ParsedEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amountMinor, 0);
}

/**
 * The opening balance the file implies: the one it states, or, when it states only a closing
 * balance (OFX), the closing balance minus all of its entries.
 */
export function statementOpeningMinor(statement: ParsedStatement): number | null {
  if (statement.openingBalanceMinor !== null) return statement.openingBalanceMinor;
  if (statement.closingBalanceMinor === null) return null;
  return statement.closingBalanceMinor - sum(statement.entries);
}

/** Walks the running balance oldest first; each break is reported once, then the walk resyncs. */
export function findRunningBalanceBreaks(statement: ParsedStatement): RunningBalanceBreak[] {
  const breaks: RunningBalanceBreak[] = [];
  let balance = statement.openingBalanceMinor;
  let previous: ParsedEntry | null = null;
  for (const entry of statement.entries) {
    if (entry.runningBalanceMinor === null) return breaks;
    if (balance !== null) {
      const expectedMinor = balance + entry.amountMinor;
      if (expectedMinor !== entry.runningBalanceMinor) {
        breaks.push({
          bankReference: entry.bankReference,
          bookingDate: entry.bookingDate,
          expectedMinor,
          statedMinor: entry.runningBalanceMinor,
          differenceMinor: expectedMinor - entry.runningBalanceMinor,
          previous: previous && {
            bankReference: previous.bankReference,
            bookingDate: previous.bookingDate,
          },
        });
      }
    }
    balance = entry.runningBalanceMinor;
    previous = entry;
  }
  return breaks;
}

/**
 * Reconciles a file against the Account (spec 26, 27):
 * - opening: on an Account with history, its computed balance before the period must equal the
 *   file's (stated or derived) opening balance;
 * - closing: the balance at period end (computed, or the file's opening on an Account with no
 *   history) plus the new Transactions must equal the closing Statement balance;
 * - running balance: every row's stated balance must follow from the previous one.
 */
export function reconcile(
  statement: ParsedStatement,
  newEntries: readonly ParsedEntry[],
  account: AccountBalances,
): Reconciliation {
  const fileOpening = statementOpeningMinor(statement);
  const opening =
    account.hasTransactions && fileOpening !== null
      ? check(fileOpening, account.balanceBeforePeriodMinor)
      : null;
  const startOfNew = account.hasTransactions ? account.balanceAtPeriodEndMinor : fileOpening;
  const closing =
    statement.closingBalanceMinor !== null && startOfNew !== null
      ? check(statement.closingBalanceMinor, startOfNew + sum(newEntries))
      : null;
  const runningBalanceBreaks = findRunningBalanceBreaks(statement);
  const isOk =
    (opening?.differenceMinor ?? 0) === 0 &&
    (closing?.differenceMinor ?? 0) === 0 &&
    runningBalanceBreaks.length === 0;
  return { status: isOk ? 'ok' : 'mismatch', opening, closing, runningBalanceBreaks };
}

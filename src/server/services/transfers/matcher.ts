/**
 * The Transfer matcher (spec, "Transfer matcher"): a pure function of the new Transactions, the
 * existing Transactions of the other Accounts, the Accounts' IBANs and an FX lookup, returning
 * ranked Transfer candidates per new Transaction. It never links anything: the user confirms.
 */

/** Booking dates at most this many days apart can be the two sides of a Transfer. */
export const TRANSFER_MAX_DAYS = 3;
/** Cross-currency sides may differ by this share of the smaller amount, after conversion. */
export const CROSS_CURRENCY_TOLERANCE_PERCENT = 2;

/** A Transaction about to be added (an Import preview entry). */
export interface MatchEntry {
  accountId: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
  counterpartyIban: string | null;
}

/** An existing Transaction on another Account, not yet in a Transfer. */
export interface MatchTransaction extends MatchEntry {
  id: string;
}

/** Converts minor units of a Currency on a date to CHF minor units; null when no rate exists. */
export type ToChf = (amountMinor: number, currency: string, date: string) => number | null;

export interface MatcherInput<T extends MatchTransaction> {
  entries: readonly MatchEntry[];
  existing: readonly T[];
  /** Every Account's IBAN (normalised), or null when it has none. */
  accountIbans: ReadonlyMap<string, string | null>;
  toChf: ToChf;
}

export interface TransferCandidate<T extends MatchTransaction = MatchTransaction> {
  transaction: T;
  /** One side names the other side's Account IBAN as its counterparty. */
  isIbanMatch: boolean;
  /** Suggested in the preview: the best IBAN match, at most once per existing Transaction. */
  isPreselected: boolean;
  /** Days between the two booking dates. */
  dayDistance: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayDistance(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

/**
 * How far the two amounts are from cancelling out, as a share of the smaller one, or null when
 * they are not opposite enough: same Currency needs an exact match, different Currencies a
 * match within the tolerance after converting both to CHF on their own booking dates.
 */
function amountGap(entry: MatchEntry, other: MatchTransaction, toChf: ToChf): number | null {
  if (Math.sign(entry.amountMinor) !== -Math.sign(other.amountMinor) || entry.amountMinor === 0) {
    return null;
  }
  if (entry.currency === other.currency) {
    return entry.amountMinor + other.amountMinor === 0 ? 0 : null;
  }
  const a = toChf(entry.amountMinor, entry.currency, entry.bookingDate);
  const b = toChf(other.amountMinor, other.currency, other.bookingDate);
  if (a === null || b === null || a === 0 || b === 0) return null;
  const gap = Math.abs(a + b);
  const smaller = Math.min(Math.abs(a), Math.abs(b));
  return gap * 100 <= smaller * CROSS_CURRENCY_TOLERANCE_PERCENT ? gap / smaller : null;
}

function isIbanMatch(
  entry: MatchEntry,
  other: MatchTransaction,
  ibans: ReadonlyMap<string, string | null>,
): boolean {
  const entryIban = ibans.get(entry.accountId) ?? null;
  const otherIban = ibans.get(other.accountId) ?? null;
  return (
    (otherIban !== null && entry.counterpartyIban === otherIban) ||
    (entryIban !== null && other.counterpartyIban === entryIban)
  );
}

interface Ranked<T extends MatchTransaction> extends TransferCandidate<T> {
  gap: number;
}

function byRank<T extends MatchTransaction>(a: Ranked<T>, b: Ranked<T>): number {
  return (
    Number(b.isIbanMatch) - Number(a.isIbanMatch) ||
    a.gap - b.gap ||
    a.dayDistance - b.dayDistance ||
    a.transaction.bookingDate.localeCompare(b.transaction.bookingDate) ||
    a.transaction.id.localeCompare(b.transaction.id)
  );
}

function candidatesFor<T extends MatchTransaction>(
  entry: MatchEntry,
  input: MatcherInput<T>,
): Ranked<T>[] {
  const ranked: Ranked<T>[] = [];
  for (const transaction of input.existing) {
    if (transaction.accountId === entry.accountId) continue;
    const days = dayDistance(entry.bookingDate, transaction.bookingDate);
    if (days > TRANSFER_MAX_DAYS) continue;
    const gap = amountGap(entry, transaction, input.toChf);
    if (gap === null) continue;
    ranked.push({
      transaction,
      isIbanMatch: isIbanMatch(entry, transaction, input.accountIbans),
      isPreselected: false,
      dayDistance: days,
      gap,
    });
  }
  return ranked.sort(byRank);
}

/**
 * Ranked Transfer candidates for each entry, in the entries' order: IBAN matches first, then
 * the closer amount, then the closer date. Each entry's best IBAN match is pre-selected, unless
 * an earlier entry already took that existing Transaction.
 */
export function findTransferCandidates<T extends MatchTransaction>(
  input: MatcherInput<T>,
): TransferCandidate<T>[][] {
  const taken = new Set<string>();
  return input.entries.map((entry) => {
    const ranked = candidatesFor(entry, input);
    const chosen = ranked.find((c) => c.isIbanMatch && !taken.has(c.transaction.id));
    if (chosen) taken.add(chosen.transaction.id);
    return ranked.map(({ gap: _gap, ...candidate }) => ({
      ...candidate,
      isPreselected: candidate.transaction === chosen?.transaction,
    }));
  });
}

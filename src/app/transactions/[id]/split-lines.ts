import { formatAmount, type NumberFormat } from '@/lib/format';
import { parseAmount } from '@/lib/format/parse-amount';
import { normalizeText } from '@/lib/text';
import type { BundledDetail } from '@/server/services/imports/parsers';
import type { PayeeRef } from '@/server/services/payees';
import type { SplitLine } from '@/server/services/transactions';

/** One Split line as the split form edits it: typed text, not yet validated. */
export interface SplitLineDraft {
  /** The saved Split line this draft edits, so it keeps its identity; absent for a new line. */
  id?: string;
  /** In the user's number format, e.g. "-70.00". */
  amount: string;
  /** Empty for a Transfer line, which can't have a Category. */
  categoryId: string;
  /**
   * The line's own Payee (ADR-0006); absent or empty for a line that takes its Transaction's.
   * A Transfer line has none.
   */
  payeeId?: string;
  /** Comma-separated Tag names. */
  tags: string;
  note: string;
  /**
   * The saved line is a Transfer side (ADR-0005): it shows its Transfer instead of a Category
   * picker, and can't be removed until the Transfer is unlinked.
   */
  isTransfer?: true;
}

/** An amount as the user types it: their number format, the Currency's decimals, no code. */
export function editableAmount(
  minor: number,
  numberFormat: NumberFormat,
  currency: string,
): string {
  return formatAmount(minor, numberFormat, { currency, hasCurrencyCode: false });
}

interface SplitSource {
  amountMinor: number;
  currency: string;
  splitLines: readonly SplitLine[];
  bundledDetails: readonly BundledDetail[] | null;
}

/**
 * A lookup from a counterparty name to the existing Payee of that name, compared as Rule text
 * conditions compare (normalised). Names two Payees share once normalised (e.g. "Cafe" and
 * "Café") are ambiguous and suggest none.
 */
function suggestPayeeByName(payees: readonly PayeeRef[]): (name: string | null) => string | null {
  const byName = new Map<string, string | null>();
  for (const payee of payees) {
    const key = normalizeText(payee.name);
    if (key === '') continue;
    byName.set(key, byName.has(key) ? null : payee.id);
  }
  return (name) => (name === null ? null : (byName.get(normalizeText(name)) ?? null));
}

/**
 * The bundled payments as Split lines, when every one has an amount and together they add up
 * exactly to the Transaction's amount; otherwise null. Each line names the existing Payee that
 * matches its counterparty name, else none so it takes the Transaction's (#71); this never
 * creates a Payee.
 */
function bundledDrafts(
  transaction: SplitSource,
  amount: (minor: number) => string,
  payees: readonly PayeeRef[],
): SplitLineDraft[] | null {
  const details = transaction.bundledDetails ?? [];
  const amounts = details.map((detail) => detail.amountMinor);
  if (amounts.length === 0 || amounts.includes(null)) return null;
  const total = amounts.reduce<number>((sum, minor) => sum + (minor ?? 0), 0);
  if (total !== transaction.amountMinor) return null;
  const suggestPayee = suggestPayeeByName(payees);
  return details.map((detail) => {
    const payeeId = suggestPayee(detail.counterpartyName);
    return {
      amount: amount(detail.amountMinor ?? 0),
      categoryId: '',
      ...(payeeId !== null && { payeeId }),
      tags: '',
      note: detail.counterpartyName ?? '',
    };
  });
}

/**
 * The lines the split form starts with: the saved Split lines when the Transaction is split,
 * else one line per bundled payment when their amounts add up to the Transaction's (#46), each
 * suggesting its Payee from `payees` (#71), otherwise one line for the full amount.
 */
export function initialSplitDrafts(
  transaction: SplitSource,
  numberFormat: NumberFormat,
  payees: readonly PayeeRef[],
): SplitLineDraft[] {
  const amount = (minor: number) => editableAmount(minor, numberFormat, transaction.currency);
  if (transaction.splitLines.length > 0) {
    return transaction.splitLines.map((line) => ({
      id: line.id,
      amount: amount(line.amountMinor),
      categoryId: line.category?.id ?? '',
      ...(line.payee && { payeeId: line.payee.id }),
      tags: line.tags.map((tag) => tag.name).join(', '),
      note: line.note ?? '',
      ...(line.transferId !== null && { isTransfer: true as const }),
    }));
  }
  return (
    bundledDrafts(transaction, amount, payees) ?? [
      { amount: amount(transaction.amountMinor), categoryId: '', tags: '', note: '' },
    ]
  );
}

/**
 * What is left to allocate: the Transaction's amount minus the typed line amounts (blank
 * lines count as zero). Null while a typed amount is not a valid amount.
 */
export function remainingMinor(
  totalMinor: number,
  amounts: readonly string[],
  numberFormat: NumberFormat,
  currency: string,
): number | null {
  const typed = amounts
    .filter((text) => text.trim() !== '')
    .map((text) => parseAmount(text, numberFormat, currency));
  if (typed.includes(null)) return null;
  return typed.reduce<number>((remaining, minor) => remaining - (minor ?? 0), totalMinor);
}

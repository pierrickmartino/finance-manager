import { formatAmount, type NumberFormat } from '@/lib/format';
import { parseAmount } from '@/lib/format/parse-amount';
import type { SplitLine } from '@/server/services/transactions';

/** One Split line as the split form edits it: typed text, not yet validated. */
export interface SplitLineDraft {
  /** In the user's number format, e.g. "-70.00". */
  amount: string;
  categoryId: string;
  /** Comma-separated Tag names. */
  tags: string;
  note: string;
}

/** An amount as the user types it: their number format, the Currency's decimals, no code. */
export function editableAmount(
  minor: number,
  numberFormat: NumberFormat,
  currency: string,
): string {
  return formatAmount(minor, numberFormat, { currency }).slice(currency.length + 1);
}

interface SplitSource {
  amountMinor: number;
  currency: string;
  splitLines: readonly SplitLine[];
}

/**
 * The lines the split form starts with: the saved Split lines when the Transaction is split,
 * otherwise one line for the full amount.
 */
export function initialSplitDrafts(
  transaction: SplitSource,
  numberFormat: NumberFormat,
): SplitLineDraft[] {
  const amount = (minor: number) => editableAmount(minor, numberFormat, transaction.currency);
  if (transaction.splitLines.length > 0) {
    return transaction.splitLines.map((line) => ({
      amount: amount(line.amountMinor),
      categoryId: line.category.id,
      tags: line.tags.map((tag) => tag.name).join(', '),
      note: line.note ?? '',
    }));
  }
  return [{ amount: amount(transaction.amountMinor), categoryId: '', tags: '', note: '' }];
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
  let remaining = totalMinor;
  for (const text of amounts) {
    if (text.trim() === '') continue;
    const minor = parseAmount(text, numberFormat, currency);
    if (minor === null) return null;
    remaining -= minor;
  }
  return remaining;
}

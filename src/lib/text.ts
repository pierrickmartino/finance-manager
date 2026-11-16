/**
 * Text normalisation shared by Fingerprints and text matching (Rules, search):
 * lower case, accents stripped, whitespace collapsed and trimmed.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A count of Transactions in words, e.g. "1 Transaction", "28 Transactions". */
export function transactionCountLabel(count: number): string {
  return `${count} Transaction${count === 1 ? '' : 's'}`;
}

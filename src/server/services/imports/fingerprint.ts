import { createHash } from 'node:crypto';
import { normalizeText } from '@/lib/text';
import type { ParsedEntry } from './parsers';

/** Prefix of a hash Fingerprint, so it can never equal a bank reference. */
const HASH_PREFIX = 'h:';

/**
 * Fingerprints for the entries of one file, in file order (ADR-0003):
 * - the bank reference when the entry has one;
 * - otherwise `h:<sha256 of Account, booking date, amount, normalised description>#<n>`, where
 *   `n` counts earlier entries of the same file with the same hash. Two identical coffees on the
 *   same day get `#0` and `#1`, and re-importing the file gives them the same Fingerprints again.
 */
export function fingerprintEntries(accountId: string, entries: readonly ParsedEntry[]): string[] {
  const occurrences = new Map<string, number>();
  return entries.map((entry) => {
    if (entry.bankReference) return entry.bankReference;
    const hash = createHash('sha256')
      .update(
        [
          accountId,
          entry.bookingDate,
          String(entry.amountMinor),
          normalizeText(entry.rawDescription),
        ].join('\u001f'),
      )
      .digest('hex');
    const index = occurrences.get(hash) ?? 0;
    occurrences.set(hash, index + 1);
    return `${HASH_PREFIX}${hash}#${index}`;
  });
}

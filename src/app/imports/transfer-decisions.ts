import type { TransferDecisions } from '@/server/services/imports';

/** Form field name prefix of an entry's Transfer choice; the entry's Fingerprint follows. */
export const TRANSFER_FIELD_PREFIX = 'transfer:';
/** The value of the "Not a Transfer" choice. */
export const NOT_A_TRANSFER = 'none';

/** Reads the confirmed Transfer candidates the commit form submits. "Not a Transfer" is left out. */
export function readTransferDecisions(formData: FormData): TransferDecisions {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(
        ([name, value]) =>
          name.startsWith(TRANSFER_FIELD_PREFIX) &&
          typeof value === 'string' &&
          value !== NOT_A_TRANSFER &&
          value !== '',
      )
      .map(([name, value]) => [name.slice(TRANSFER_FIELD_PREFIX.length), value as string]),
  );
}

import type { NearDuplicateDecisions } from '@/server/services/imports';

/** Form field name prefix of a near-duplicate's keep/skip choice; the Fingerprint follows. */
export const NEAR_DUPLICATE_FIELD_PREFIX = 'nearDuplicate:';

/** Reads the keep/skip choices the commit form submits. Anything but `keep` is a skip. */
export function readNearDuplicateDecisions(formData: FormData): NearDuplicateDecisions {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([name]) => name.startsWith(NEAR_DUPLICATE_FIELD_PREFIX))
      .map(([name, value]) => [
        name.slice(NEAR_DUPLICATE_FIELD_PREFIX.length),
        value === 'keep' ? 'keep' : 'skip',
      ]),
  );
}

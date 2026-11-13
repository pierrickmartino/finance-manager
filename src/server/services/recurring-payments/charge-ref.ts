import { z } from 'zod';

/** What a charge is: a whole unsplit Transaction, or one Split line (ADR-0011). */
export const CHARGE_KINDS = ['transaction', 'splitLine'] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

/**
 * Names one charge: series are not stored, so a charge is how a series is named, in a Drill-down
 * link or a dismissal.
 */
export interface ChargeRef {
  kind: ChargeKind;
  /** The Transaction's id, or the Split line's for a line. */
  id: string;
}

/** A charge reference from untrusted input: a known kind and a uuid. */
export const chargeRefSchema = z.object({
  kind: z.enum(CHARGE_KINDS, { error: 'Unknown charge kind' }),
  id: z.uuid({ error: 'A charge must be a Transaction or Split line id' }),
});

/** A charge as one string, `kind:id`, as a link or a lookup key names it. */
export function chargeKey(ref: ChargeRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** The charge a `kind:id` key names; null unless it has a known kind and a uuid. */
export function parseChargeKey(key: string): ChargeRef | null {
  const separator = key.indexOf(':');
  if (separator < 0) return null;
  const parsed = chargeRefSchema.safeParse({
    kind: key.slice(0, separator),
    id: key.slice(separator + 1),
  });
  return parsed.success ? parsed.data : null;
}

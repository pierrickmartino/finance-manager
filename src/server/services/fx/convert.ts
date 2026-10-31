import { BASE_CURRENCY } from './constants';
import { fractionDigits } from '@/lib/format';

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts an amount in minor units of `currency` into CHF minor units at `rateToChf` (CHF per
 * unit, as decimal text). Exact integer arithmetic; the result is rounded half away from zero
 * (CHF 0.005 → 0.01, CHF -0.005 → -0.01), which is also what PostgreSQL's `round(numeric)` does,
 * so SQL reports that convert per Transaction agree with this to the cent.
 */
export function toChfMinor(amountMinor: number, currency: string, rateToChf: string): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Amount must be a whole number of minor units, got ${amountMinor}`);
  }
  const match = DECIMAL.exec(rateToChf);
  if (!match) throw new Error(`FX rate must be a positive decimal, got "${rateToChf}"`);
  const [, whole, fraction = ''] = match as unknown as [string, string, string | undefined];

  // amount / 10^sourceDigits × rate × 10^chfDigits, as one fraction of integers.
  const numerator =
    BigInt(amountMinor) * BigInt(whole + fraction) * 10n ** BigInt(fractionDigits(BASE_CURRENCY));
  const denominator = 10n ** BigInt(fraction.length + fractionDigits(currency));

  const magnitude = numerator < 0n ? -numerator : numerator;
  let quotient = magnitude / denominator;
  if ((magnitude % denominator) * 2n >= denominator) quotient += 1n;
  const result = Number(numerator < 0n ? -quotient : quotient);
  if (!Number.isSafeInteger(result)) {
    throw new Error('The CHF amount exceeds the safe integer range');
  }
  return result;
}

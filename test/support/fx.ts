import { backfillRates, type EcbRateSource } from '@/server/services/fx';
import type { ServiceContext } from '@/server/services/context';

/** An EUR rate to store: CHF per 1 EUR on that day (an ECB reference day). */
export type EurRate = readonly [date: string, rateToChf: string];

/**
 * Stores EUR rates the way the app does: through `backfillRates` with a stubbed ECB source
 * that quotes CHF per EUR on exactly the given days (the ECB source is the only test double).
 */
export async function seedEurRates(ctx: ServiceContext, rates: readonly EurRate[]): Promise<void> {
  if (rates.length === 0) return;
  const byDate = new Map(rates);
  const source: EcbRateSource = {
    async fetchReferenceRates({ from, to }) {
      return [...byDate]
        .filter(([date]) => date >= from && date <= to)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, chfPerEur]) => ({ date, perEur: { CHF: chfPerEur } }));
    },
  };
  const dates = [...byDate.keys()].sort();
  await backfillRates(ctx, source, { from: dates[0]!, to: dates.at(-1)! });
}

import { BASE_CURRENCY } from './constants';
import { toChfMinor } from './convert';

/** A stored rate: CHF per unit of `currency` on `date`, as decimal text. */
export interface StoredRate {
  currency: string;
  date: string;
  rateToChf: string;
}

/** An FX rate found for a date: `rateDate` is that date or the most recent earlier one. */
export interface FxRate {
  currency: string;
  /** The date asked for. */
  date: string;
  /** The date of the rate used (on or before `date`). */
  rateDate: string;
  /** CHF per one unit of `currency`, as exact decimal text (e.g. "0.9324"). */
  rateToChf: string;
}

/** An amount valued in CHF, with the rate used. */
export interface ChfValue {
  /** CHF minor units, rounded half away from zero. */
  amountMinor: number;
  rate: FxRate;
}

/** Synchronous rate lookups over rates loaded once (see `loadRateTable`). */
export interface RateTable {
  /** The rate on `date`, or the most recent earlier one; CHF is 1; null when none is loaded. */
  rateOn(currency: string, date: string): FxRate | null;
  /** `amountMinor` of `currency` in CHF minor units at `rateOn(currency, date)`, or null. */
  toChf(amountMinor: number, currency: string, date: string): ChfValue | null;
}

/** Index of the last entry whose date is on or before `date`, or -1. */
function lastOnOrBefore(rates: readonly StoredRate[], date: string): number {
  let low = 0;
  let high = rates.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (rates[middle]!.date <= date) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function createRateTable(rates: readonly StoredRate[]): RateTable {
  const byCurrency = new Map<string, StoredRate[]>();
  for (const rate of rates) {
    byCurrency.set(rate.currency, [...(byCurrency.get(rate.currency) ?? []), rate]);
  }
  for (const [currency, list] of byCurrency) {
    byCurrency.set(
      currency,
      list.toSorted((a, b) => a.date.localeCompare(b.date)),
    );
  }

  const rateOn = (currency: string, date: string): FxRate | null => {
    if (currency === BASE_CURRENCY) return { currency, date, rateDate: date, rateToChf: '1' };
    const list = byCurrency.get(currency) ?? [];
    const found = list[lastOnOrBefore(list, date)];
    return found ? { currency, date, rateDate: found.date, rateToChf: found.rateToChf } : null;
  };

  return {
    rateOn,
    toChf(amountMinor, currency, date) {
      const rate = rateOn(currency, date);
      return rate ? { amountMinor: toChfMinor(amountMinor, currency, rate.rateToChf), rate } : null;
    },
  };
}

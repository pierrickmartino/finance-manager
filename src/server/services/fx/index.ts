/**
 * FX module (ADR-0002): ECB reference rates into the Base currency, CHF. Amounts are never
 * stored in CHF; they are converted when read, with the rate of the date or the most recent
 * earlier one.
 */
export { BASE_CURRENCY } from './constants';
export { toChfMinor } from './convert';
export { BACKFILL_FROM, backfillRates, fetchDailyRates, type FetchResult } from './fetch';
export { convertToChf, getRate, loadRateTable } from './lookup';
export type { ChfValue, FxRate, RateTable } from './rate-table';
export type { EcbRateSource, ReferenceRateDay, ReferenceRateRequest } from './source';
export {
  getRateStatus,
  STALE_FETCH_AFTER_HOURS,
  STALE_RATE_AFTER_DAYS,
  type RateStatus,
} from './status';

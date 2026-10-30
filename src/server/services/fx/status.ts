import type { ServiceContext } from '../context';
import { ECB_QUOTE_CURRENCY, ECB_SOURCE_NAME } from './constants';
import { daysBetween, swissToday } from './dates';

/** Rates older than this many days are stale: the longest ECB gap is Easter (Thursday to Tuesday). */
export const STALE_RATE_AFTER_DAYS = 5;
/** The daily job runs every day: two days without a successful fetch means it is broken. */
export const STALE_FETCH_AFTER_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;

/** When rates were last fetched, and whether CHF figures may be out of date (story 96). */
export interface RateStatus {
  /** The last successful fetch. */
  lastFetchedAt: Date | null;
  /** The last fetch, successful or not. */
  lastAttemptAt: Date | null;
  /** Why the last fetch failed; null when it succeeded. */
  lastError: string | null;
  /** The newest EUR rate stored. */
  latestRateDate: string | null;
  isStale: boolean;
  /** Why the rates are stale, for the warning; null when they are not. */
  staleReason: string | null;
}

function staleReason(
  latestRateDate: string | null,
  lastFetchedAt: Date | null,
  now: Date,
): string | null {
  if (!latestRateDate || !lastFetchedAt) return 'No FX rates have been fetched yet';
  if (daysBetween(latestRateDate, swissToday(now)) > STALE_RATE_AFTER_DAYS) {
    return `The newest FX rate is from ${latestRateDate}`;
  }
  if (now.getTime() - lastFetchedAt.getTime() > STALE_FETCH_AFTER_HOURS * HOUR_MS) {
    return `FX rates were last fetched more than ${STALE_FETCH_AFTER_HOURS} hours ago`;
  }
  return null;
}

export async function getRateStatus(ctx: ServiceContext): Promise<RateStatus> {
  const result = await ctx.db.query<{
    lastFetchedAt: Date | null;
    lastAttemptAt: Date | null;
    lastError: string | null;
    latestRateDate: string | null;
  }>(
    `SELECT s.last_success_at AS "lastFetchedAt", s.last_attempt_at AS "lastAttemptAt",
            s.last_error AS "lastError",
            (SELECT max(date) FROM fx_rate WHERE currency = $2) AS "latestRateDate"
     FROM (SELECT 1) AS one
     LEFT JOIN fx_fetch_status s ON s.source = $1`,
    [ECB_SOURCE_NAME, ECB_QUOTE_CURRENCY],
  );
  const row = result.rows[0]!;
  const reason = staleReason(row.latestRateDate, row.lastFetchedAt, new Date());
  return { ...row, isStale: reason !== null, staleReason: reason };
}

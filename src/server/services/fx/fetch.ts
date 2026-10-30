import { z } from 'zod';
import type pg from 'pg';
import type { Queryable } from '@/server/db/client';
import { withTransaction } from '@/server/db/transaction';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { BASE_CURRENCY, ECB_QUOTE_CURRENCY, ECB_SOURCE_NAME, isoDate } from './constants';
import { addDays, swissToday } from './dates';
import type { EcbRateSource, ReferenceRateDay } from './source';

/** The first day the app converts (story 92). */
export const BACKFILL_FROM = '2021-01-01';
/**
 * Every fetch starts this many days before the range it must cover, so the first days of the
 * range (2021-01-01 is an ECB holiday) have an earlier rate to fall back on, and a rate the ECB
 * corrects within the week is picked up.
 */
const LOOKBACK_DAYS = 7;

/** What a fetch or backfill wrote. Re-fetching the same days writes nothing. */
export interface FetchResult {
  from: string;
  to: string;
  inserted: number;
  updated: number;
}

/** Currencies to ask the ECB for: CHF, plus every Account Currency other than CHF and EUR. */
async function wantedCurrencies(db: Queryable): Promise<string[]> {
  const result = await db.query<{ currency: string }>(
    `SELECT DISTINCT currency FROM account WHERE currency NOT IN ($1, $2) ORDER BY currency`,
    [BASE_CURRENCY, ECB_QUOTE_CURRENCY],
  );
  return [BASE_CURRENCY, ...result.rows.map((row) => row.currency)];
}

const positiveDecimal = /^\d+(\.\d+)?$/;
const referenceRateDays = z.array(
  z.object({
    date: isoDate,
    perEur: z.record(
      z.string().regex(/^[A-Z]{3}$/),
      z
        .string()
        .regex(positiveDecimal)
        .refine((value) => Number(value) > 0),
    ),
  }),
);

interface RateRows {
  dates: string[];
  currencies: string[];
  chfPerEur: string[];
  unitsPerEur: string[];
}

/**
 * Turns ECB days into rows of (date, Currency, CHF per EUR, units of the Currency per EUR).
 * Days outside the range or without a CHF rate are skipped: nothing can be derived from them.
 */
function toRateRows(days: ReferenceRateDay[], from: string, to: string): RateRows {
  const parsed = referenceRateDays.safeParse(days);
  if (!parsed.success) {
    throw new Error(`Malformed ECB rates: ${z.prettifyError(parsed.error)}`);
  }
  const valid = parsed.data;
  const byDate = new Map(
    valid.filter((day) => day.date >= from && day.date <= to).map((day) => [day.date, day]),
  );
  const rows: RateRows = { dates: [], currencies: [], chfPerEur: [], unitsPerEur: [] };
  for (const { date, perEur } of byDate.values()) {
    const chf = perEur[BASE_CURRENCY];
    if (!chf) continue;
    const quotes: [string, string][] = [
      [ECB_QUOTE_CURRENCY, '1'],
      ...Object.entries(perEur).filter(
        ([currency]) => currency !== BASE_CURRENCY && currency !== ECB_QUOTE_CURRENCY,
      ),
    ];
    for (const [currency, units] of quotes) {
      rows.dates.push(date);
      rows.currencies.push(currency);
      rows.chfPerEur.push(chf);
      rows.unitsPerEur.push(units);
    }
  }
  return rows;
}

/** Upserts rates; a row whose rate is unchanged is not touched. */
async function storeRates(
  tx: pg.PoolClient,
  rows: RateRows,
): Promise<Omit<FetchResult, 'from' | 'to'>> {
  const result = await tx.query<{ inserted: number; updated: number }>(
    `WITH incoming AS (
       SELECT d AS date, c AS currency, round(chf / units, 10) AS rate_to_chf
       FROM unnest($1::date[], $2::text[], $3::numeric[], $4::numeric[]) AS u(d, c, chf, units)
     ), written AS (
       INSERT INTO fx_rate (date, currency, rate_to_chf)
       SELECT date, currency, rate_to_chf FROM incoming
       ON CONFLICT (date, currency) DO UPDATE SET rate_to_chf = EXCLUDED.rate_to_chf
       WHERE fx_rate.rate_to_chf <> EXCLUDED.rate_to_chf
       RETURNING (xmax = 0) AS is_insert
     )
     SELECT count(*) FILTER (WHERE is_insert)::int AS inserted,
            count(*) FILTER (WHERE NOT is_insert)::int AS updated
     FROM written`,
    [rows.dates, rows.currencies, rows.chfPerEur, rows.unitsPerEur],
  );
  return result.rows[0]!;
}

async function recordAttempt(db: Queryable, error: string | null): Promise<void> {
  // The clock is the app's, not the database's, so the status and its staleness agree.
  await db.query(
    `INSERT INTO fx_fetch_status (source, last_attempt_at, last_success_at, last_error)
     VALUES ($1, $3, CASE WHEN $2::text IS NULL THEN $3::timestamptz END, $2)
     ON CONFLICT (source) DO UPDATE SET
       last_attempt_at = EXCLUDED.last_attempt_at,
       last_success_at = COALESCE(EXCLUDED.last_success_at, fx_fetch_status.last_success_at),
       last_error = EXCLUDED.last_error`,
    [ECB_SOURCE_NAME, error, new Date()],
  );
}

/**
 * Fetches the range from the source and stores it. Not recorded in History (story 117): rates
 * are reference data, and the fetch status says when they last changed.
 */
async function fetchRange(
  ctx: ServiceContext,
  source: EcbRateSource,
  from: string,
  to: string,
): Promise<FetchResult> {
  const currencies = await wantedCurrencies(ctx.db);
  try {
    const days = await source.fetchReferenceRates({ currencies, from, to });
    const rows = toRateRows(days, from, to);
    return await withTransaction(ctx.db, async (tx) => {
      const counts = await storeRates(tx, rows);
      await recordAttempt(tx, null);
      return { from, to, ...counts };
    });
  } catch (error: unknown) {
    await recordAttempt(ctx.db, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

const backfillInput = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    error: 'From must not be after To',
  });

/**
 * Fetches every rate from `from` (default 2021-01-01) to `to` (default today), plus a short
 * lookback before `from`. Safe to run again: unchanged rates are not rewritten.
 */
export async function backfillRates(
  ctx: ServiceContext,
  source: EcbRateSource,
  range: { from?: string; to?: string } = {},
): Promise<FetchResult> {
  const input = parseInput(backfillInput, range);
  const from = addDays(input.from ?? BACKFILL_FROM, -LOOKBACK_DAYS);
  return fetchRange(ctx, source, from, input.to ?? swissToday());
}

/**
 * The start of the range a daily fetch must cover: the oldest "latest stored rate" across the
 * Currencies in use, or 2021-01-01 when one of them has none yet (a new Account's Currency).
 */
async function dailyFetchStart(db: Queryable): Promise<string> {
  const stored = (await wantedCurrencies(db)).map((currency) =>
    currency === BASE_CURRENCY ? ECB_QUOTE_CURRENCY : currency,
  );
  const result = await db.query<{ currency: string; latest: string }>(
    `SELECT currency, max(date) AS latest FROM fx_rate
     WHERE currency = ANY($1::text[]) GROUP BY currency`,
    [stored],
  );
  if (result.rows.length < stored.length) return BACKFILL_FROM;
  return result.rows.map((row) => row.latest).sort()[0]!;
}

/**
 * The scheduled daily job (`pnpm fx:fetch`): fetches from a week before the latest stored rate
 * up to today, so missed days are caught up and recent corrections are taken. With no rates yet
 * (or a new Account Currency) it backfills from 2021-01-01.
 */
export async function fetchDailyRates(
  ctx: ServiceContext,
  source: EcbRateSource,
): Promise<FetchResult> {
  const from = addDays(await dailyFetchStart(ctx.db), -LOOKBACK_DAYS);
  return fetchRange(ctx, source, from, swissToday());
}

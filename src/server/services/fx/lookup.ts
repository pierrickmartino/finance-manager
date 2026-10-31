import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import type { ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import { BASE_CURRENCY, currencyCode, isoDate } from './constants';
import { toChfMinor } from './convert';
import { createRateTable, type ChfValue, type FxRate, type RateTable } from './rate-table';

const rateQuery = z.object({ currency: currencyCode, date: isoDate });
const conversionInput = rateQuery.extend({
  amountMinor: z.int({ error: 'Amount must be a whole number of minor units' }),
});

/**
 * Values an amount (minor units of its Currency) in CHF at the rate of `date`, falling back to
 * the most recent earlier rate. Nothing is stored (ADR-0002).
 */
export async function convertToChf(
  ctx: ServiceContext,
  amount: { amountMinor: number; currency: string; date: string },
): Promise<ChfValue> {
  const input = parseInput(conversionInput, amount);
  const rate = await getRate(ctx, input.currency, input.date);
  return { amountMinor: toChfMinor(input.amountMinor, rate.currency, rate.rateToChf), rate };
}

/**
 * The FX rate of a Currency on a date: that day's rate, or the most recent earlier one
 * (weekends and holidays). CHF is always 1. Throws NotFoundError when no rate exists on or
 * before the date.
 */
export async function getRate(
  ctx: ServiceContext,
  currency: string,
  date: string,
): Promise<FxRate> {
  const input = parseInput(rateQuery, { currency, date });
  if (input.currency === BASE_CURRENCY) {
    return { currency: input.currency, date: input.date, rateDate: input.date, rateToChf: '1' };
  }
  const result = await ctx.db.query<{ rateDate: string; rateToChf: string }>(
    `SELECT date AS "rateDate", trim_scale(rate_to_chf)::text AS "rateToChf"
     FROM fx_rate WHERE currency = $1 AND date <= $2
     ORDER BY date DESC LIMIT 1`,
    [input.currency, input.date],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError(`No FX rate for ${input.currency} on or before ${input.date}`);
  }
  return { currency: input.currency, date: input.date, ...row };
}

const rateTableInput = z
  .object({
    currencies: z.array(currencyCode).optional(),
    from: isoDate,
    to: isoDate,
  })
  .refine((range) => range.from <= range.to, { error: 'From must not be after To' });

/**
 * Loads the rates needed to convert anything dated from `from` to `to` (each Currency's rates in
 * the range, plus its last rate before `from` for the fallback), for many synchronous lookups:
 * a list of balances, or the Transfer matcher's FX lookup. `currencies` defaults to all.
 */
export async function loadRateTable(
  ctx: { db: Queryable },
  range: { currencies?: string[]; from: string; to: string },
): Promise<RateTable> {
  const input = parseInput(rateTableInput, range);
  const result = await ctx.db.query<{ currency: string; date: string; rateToChf: string }>(
    `WITH wanted AS (
       SELECT currency, date, rate_to_chf FROM fx_rate
       WHERE ($1::text[] IS NULL OR currency = ANY($1::text[]))
     )
     SELECT currency, date, trim_scale(rate_to_chf)::text AS "rateToChf"
     FROM wanted WHERE date BETWEEN $2 AND $3
     UNION ALL
     (SELECT DISTINCT ON (currency) currency, date, trim_scale(rate_to_chf)::text
      FROM wanted WHERE date < $2
      ORDER BY currency, date DESC)`,
    [input.currencies ?? null, input.from, input.to],
  );
  return createRateTable(result.rows);
}

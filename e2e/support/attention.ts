import type { ServiceContext } from '../../src/server/services/context';
import { addDays, swissToday } from '../../src/lib/dates';
import { backfillRates, type EcbRateSource } from '../../src/server/services/fx';
import {
  editClassification,
  listTransactions,
  MAX_PAGE_SIZE,
  splitTransaction,
} from '../../src/server/services/transactions';

const MAX_PASSES = 50;

/**
 * Gives every Unclassified Transaction, and every Unclassified Split line, `categoryId`, so the
 * shared E2E database has nothing Unclassified left (for the bell's empty state).
 */
export async function classifyEverything(ctx: ServiceContext, categoryId: string): Promise<void> {
  // A page at a time; bounded, so a Transaction that stays Unclassified fails instead of looping.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { transactions } = await listTransactions(ctx, {
      unclassified: true,
      pageSize: MAX_PAGE_SIZE,
    });
    if (transactions.length === 0) return;
    for (const transaction of transactions) {
      if (transaction.splitLines.length === 0) {
        await editClassification(ctx, transaction.id, { categoryId });
        continue;
      }
      await splitTransaction(
        ctx,
        transaction.id,
        transaction.splitLines.map((line) => ({
          id: line.id,
          amountMinor: line.amountMinor,
          categoryId: line.transferId ? null : (line.category?.id ?? categoryId),
          payeeId: line.payee?.id ?? null,
          tagIds: line.tags.map((tag) => tag.id),
          note: line.note,
        })),
      );
    }
  }
  throw new Error('Transactions are still Unclassified');
}

/** An ECB that publishes 0.9324 CHF per EUR on every day asked for. */
const everyDayEcb: EcbRateSource = {
  async fetchReferenceRates({ from, to }) {
    const days = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      days.push({ date: day, perEur: { CHF: '0.9324' } });
    }
    return days;
  },
};

/** Puts the FX rates and fetch status back as they were, on a (new) service context. */
export type RestoreFxRates = (ctx: ServiceContext) => Promise<void>;

const RECENT_DAYS = 14;

/**
 * Fetches today's FX rates, so they are not Stale (for the bell's empty state). Returns how to
 * put the rates and fetch status back as they were: later specs expect the rates they seed to
 * be the newest.
 */
export async function freshenFxRates(ctx: ServiceContext): Promise<RestoreFxRates> {
  const today = swissToday();
  const since = addDays(today, -RECENT_DAYS);
  const rateKeys = (
    await ctx.db.query<{ key: string }>(
      `SELECT date::text || currency AS key FROM fx_rate WHERE date >= $1`,
      [since],
    )
  ).rows.map((row) => row.key);
  const status = (await ctx.db.query('SELECT * FROM fx_fetch_status')).rows;
  await backfillRates(ctx, everyDayEcb, { from: today, to: today });
  return async (later) => {
    await later.db.query(
      `DELETE FROM fx_rate WHERE date >= $1 AND NOT (date::text || currency = ANY($2::text[]))`,
      [since, rateKeys],
    );
    await later.db.query('DELETE FROM fx_fetch_status');
    for (const row of status) {
      await later.db.query(
        `INSERT INTO fx_fetch_status SELECT * FROM json_populate_record(NULL::fx_fetch_status, $1)`,
        [JSON.stringify(row)],
      );
    }
  };
}

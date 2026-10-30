/**
 * Fetches ECB reference rates into fx_rate. Runs once and exits.
 *   pnpm fx:fetch                         the daily job (Railway cron service `fx-rates`):
 *                                         a week before the latest stored rate up to today,
 *                                         or a full backfill from 2021-01-01 when none exist
 *   pnpm fx:backfill [from] [to]          re-fetch a range (default 2021-01-01 to today)
 * Exits non-zero when the fetch fails; the failure is also shown in the rate status.
 * See docs/runbooks/fx-rates.md.
 */
import { createEcbRateSource } from '../src/server/fx/ecb-source';
import { createDb } from '../src/server/db/client';
import { backfillRates, fetchDailyRates } from '../src/server/services/fx';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const [command, from, to] = process.argv.slice(2);
  const db = createDb(url);
  // Not a user action, and FX fetches write no History (story 117).
  const ctx = { db, actor: { type: 'system' as const, id: null } };
  const source = createEcbRateSource();
  try {
    const result =
      command === 'backfill'
        ? await backfillRates(ctx, source, { from, to })
        : await fetchDailyRates(ctx, source);
    console.log(
      `FX rates ${result.from} to ${result.to}: ${result.inserted} new, ${result.updated} corrected`,
    );
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

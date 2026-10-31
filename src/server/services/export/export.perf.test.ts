import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { EXPORT_BATCH_SIZE, exportTransactionsCsv } from '.';

/**
 * Exporting 20k Transactions streams (ticket #21): the export yields many bounded chunks, one
 * per batch of rows, instead of one string holding the whole ledger, and every Transaction is
 * written exactly once across the batch boundaries (many share a booking date).
 */
const t = setupTestDatabase();

const TRANSACTION_COUNT = 20_000;
const BUDGET_MS = 10_000;

async function seedLedger(): Promise<void> {
  const bank = await createBank(t.ctx, { name: 'Perf bank' });
  const account = await createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Perf',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
  await seedTransactions(t.ctx.db, account, [{ bookingDate: '2021-01-01', amountMinor: 1 }]);
  // Bulk rows in SQL (row-by-row inserts take minutes); 50 Transactions share each date.
  await t.ctx.db.query(
    `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
       currency, fingerprint, raw_description)
     SELECT a.id, i.id, false, DATE '2021-01-01' + (n / 50), (n * 7919) % 200000 - 150000,
            'CHF', 'perf-' || n, 'CARTE COOP GENÈVE ' || n
     FROM generate_series(1, $1::int) AS n, account a JOIN import i ON i.account_id = a.id`,
    [TRANSACTION_COUNT - 1],
  );
  await t.ctx.db.query('ANALYZE "transaction"');
}

describe('CSV export of 20k Transactions', () => {
  it(
    'streams them in bounded chunks, each Transaction once',
    async () => {
      await seedLedger();
      const ids = new Set<string>();
      let chunks = 0;
      let largestChunkLines = 0;
      const start = performance.now();

      for await (const chunk of exportTransactionsCsv(t.ctx)) {
        chunks += 1;
        const lines = chunk.split('\r\n').slice(0, -1);
        largestChunkLines = Math.max(largestChunkLines, lines.length);
        if (chunks === 1) continue; // BOM and header
        for (const line of lines) ids.add(line.slice(line.lastIndexOf(',') + 1));
      }
      const ms = performance.now() - start;

      expect(ids.size).toBe(TRANSACTION_COUNT);
      expect(chunks).toBe(1 + Math.ceil(TRANSACTION_COUNT / EXPORT_BATCH_SIZE));
      expect(largestChunkLines).toBeLessThanOrEqual(EXPORT_BATCH_SIZE);
      expect(ms).toBeLessThan(BUDGET_MS);
    },
    60_000,
  );
});

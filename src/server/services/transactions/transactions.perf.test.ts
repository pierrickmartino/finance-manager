import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { listTransactions, type TransactionQuery } from '.';

/**
 * The Transaction list stays responsive with 20k Transactions (ticket #14).
 *
 * Seeds 20 000 Transactions over four Accounts and five years, then times the list's first page
 * for the common filter shapes. Indexes that serve them (migration `transaction_search`):
 * - `transaction_list_order (booking_date DESC, entry_order DESC)`: unfiltered list and date
 *   ranges walk the index in order and stop after one page.
 * - `transaction_account_date (account_id, booking_date)`: one Account.
 * - `transaction_search_text` (GIN, pg_trgm) on the generated `search_text` column: free text.
 *
 * Measured with EXPLAIN ANALYZE on Postgres 16 (2026-10-30, same seed, warm cache):
 * - first page, unfiltered: index scan on transaction_list_order, 0.1 ms; count(*) 6 ms
 * - last page (OFFSET 19 950): same index, 14 ms
 * - text 'cafe du marche' (4 000 matches): ordered index scan with filter, 0.2 ms; count 5 ms
 * - text 'rf1234' (1 match): bitmap scan on transaction_search_text, 0.1 ms
 * - date range (one quarter): ordered index scan, 0.1 ms
 * The total count is a sequential scan of the narrow table (~6 ms at 20k rows). The budget below
 * is generous so a slow CI runner doesn't flake; it catches order-of-magnitude regressions
 * (a per-row function call in the WHERE clause, filtering in JS, an N+1 query).
 */
const t = setupTestDatabase();

const TRANSACTION_COUNT = 20_000;
const ACCOUNT_COUNT = 4;
const BUDGET_MS = 250;

let accounts: Account[] = [];

async function seedLargeLedger(): Promise<void> {
  const bank = await createBank(t.ctx, { name: 'Perf bank' });
  accounts = [];
  for (let index = 0; index < ACCOUNT_COUNT; index += 1) {
    accounts.push(
      await createAccount(t.ctx, {
        bankId: bank.id,
        name: `Perf ${index}`,
        currency: 'CHF',
        iban: null,
        kind: 'current',
        importFormat: 'ubs_csv',
        openingBalanceMinor: 0,
      }),
    );
  }
  // One seeded Import per Account, then the bulk rows in SQL (row-by-row inserts take minutes).
  for (const target of accounts) {
    await seedTransactions(t.ctx.db, target, [{ bookingDate: '2021-01-01', amountMinor: 0 }]);
  }
  await t.ctx.db.query(
    `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
       currency, fingerprint, raw_description, counterparty_name, payment_reference)
     SELECT acc.id, imp.id, false, DATE '2021-01-01' + (n % 1800), ((n * 7919) % 200000) - 150000,
            'CHF', 'perf-' || n,
            (ARRAY['CARTE COOP GENÈVE', 'TWINT MIGROS ZÜRICH', 'ORDRE e-banking',
                   'CAFÉ DU MARCHÉ', 'Débit LSV Swisscom'])[1 + n % 5] || ' ' || n,
            (ARRAY['Coop', 'Migros', 'Société Électrique', NULL])[1 + n % 4],
            CASE WHEN n % 10 = 0 THEN 'RF' || n END
     FROM generate_series(1, $1::int) AS n
     JOIN LATERAL (SELECT id FROM account ORDER BY id OFFSET (n % $2::int) LIMIT 1) acc ON true
     JOIN import imp ON imp.account_id = acc.id`,
    [TRANSACTION_COUNT - ACCOUNT_COUNT, ACCOUNT_COUNT],
  );
  await t.ctx.db.query('ANALYZE "transaction"');
}

async function timed(query: TransactionQuery): Promise<{ ms: number; total: number }> {
  await listTransactions(t.ctx, query); // warm the plan cache and buffers
  const start = performance.now();
  const page = await listTransactions(t.ctx, query);
  return { ms: performance.now() - start, total: page.total };
}

describe('Transaction list with 20k Transactions', () => {
  beforeEach(seedLargeLedger, 120_000);

  it('returns a filtered page within budget for every common filter shape', async () => {
    const queries: Record<string, TransactionQuery> = {
      unfiltered: {},
      lastPage: { page: 400 },
      dateRange: { from: '2024-01-01', to: '2024-03-31' },
      account: { accountId: accounts[1]!.id },
      text: { text: 'cafe du marche' },
      counterparty: { text: 'electrique' },
      amountRange: { amountMin: -5000, amountMax: -1000 },
      combined: {
        accountId: accounts[2]!.id,
        from: '2023-01-01',
        to: '2024-12-31',
        text: 'geneve',
        amountMax: 0,
        status: 'imported',
      },
    };

    const unfiltered = await timed({});
    expect(unfiltered.total).toBe(TRANSACTION_COUNT);
    for (const [name, query] of Object.entries(queries)) {
      const { ms, total } = await timed(query);
      expect(total, name).toBeGreaterThan(0);
      expect(ms, `${name} took ${ms.toFixed(1)} ms`).toBeLessThan(BUDGET_MS);
    }
  }, 120_000);
});

import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { listCellTransactions, runWidgetQuery, type WidgetQueryInput } from '.';

/**
 * A 6-year, 20k-Transaction month × Category report returns in under 1 s (ticket #20).
 *
 * Seeds 20 000 Transactions from 2020 to 2025 over two CHF Accounts and one EUR Account
 * (a third of them in EUR, so a third need an FX lookup), 30 Categories in 6 groups (one of them
 * Capital), 5 % Transfers, 10 % unclassified and 10 % split into two Split lines (ADR-0004),
 * plus a daily EUR rate on business days.
 *
 * Measured on Postgres 16, 4 vCPU container, warm cache (2026-10-31), same seed:
 * - month × Category, 6 years: ~95 ms end to end (72 rows × 23 columns). EXPLAIN ANALYZE:
 *   execution 98 ms. Sequential scan of `transaction` (19k rows in range, 5 ms), hash joins to
 *   category and category_group, then the LATERAL "latest rate on or before" lookup, memoized
 *   per (Currency, booking date): ~1.8k backward index scans on `fx_rate_pkey`, ~19 µs each
 *   (~60 ms, the bulk of the cost). The CTE is materialized once and read by four hash
 *   aggregates (cells, row totals, column totals, grand total) in ~17 ms.
 * - drill-down into one cell: ~72 ms (same CTE, then one page of list items).
 * With 10 % split Transactions (4 000 Split lines, ticket #41), 2026-11-01, same container under
 * load from parallel test runs: month × Category ~300 ms, drill-down ~150 ms (the extra hash
 * join to split_line and count(DISTINCT) per aggregate).
 * Railway's smallest plans run the database on shared vCPUs that are 2–4× slower than this
 * container; the budget below leaves that margin. It catches order-of-magnitude regressions
 * (an N+1, a per-row rate lookup without the index, aggregation in JS).
 */
const t = setupTestDatabase();

const TRANSACTION_COUNT = 20_000;
const BUDGET_MS = 1_000;

let accounts: Account[] = [];

async function seedSixYears(): Promise<void> {
  const bank = await createBank(t.ctx, { name: 'Perf bank' });
  accounts = [];
  for (const [name, currency] of [
    ['Perf CHF 1', 'CHF'],
    ['Perf CHF 2', 'CHF'],
    ['Perf EUR', 'EUR'],
  ] as const) {
    accounts.push(
      await createAccount(t.ctx, {
        bankId: bank.id,
        name,
        currency,
        iban: null,
        kind: 'current',
        importFormat: 'ubs_csv',
        openingBalanceMinor: 0,
      }),
    );
  }
  for (const target of accounts) {
    await seedTransactions(t.ctx.db, target, [{ bookingDate: '2020-01-01', amountMinor: 0 }]);
  }
  await t.ctx.db.query(
    `INSERT INTO fx_rate (currency, date, rate_to_chf)
     SELECT 'EUR', d::date, 0.93 + (extract(doy FROM d) % 50) / 1000.0
     FROM generate_series(DATE '2019-12-01', DATE '2025-12-31', INTERVAL '1 day') AS d
     WHERE extract(isodow FROM d) < 6`,
  );
  await t.ctx.db.query(
    `INSERT INTO category_group (name, type, sort)
     SELECT 'Group ' || g, CASE WHEN g = 1 THEN 'income' WHEN g = 6 THEN 'capital'
                                ELSE 'expense' END, g
     FROM generate_series(1, 6) AS g`,
  );
  await t.ctx.db.query(
    `INSERT INTO category (group_id, name, sort)
     SELECT g.id, 'Category ' || g.sort || '.' || c, c
     FROM category_group g CROSS JOIN generate_series(1, 5) AS c`,
  );
  await t.ctx.db.query(
    `INSERT INTO transfer (id) SELECT gen_random_uuid() FROM generate_series(1, 1)`,
  );
  await t.ctx.db.query(
    `WITH cats AS (SELECT c.id, row_number() OVER (ORDER BY g.sort, c.sort) - 1 AS position
                  FROM category c JOIN category_group g ON g.id = c.group_id)
     INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
       currency, fingerprint, raw_description, category_id, transfer_id)
     SELECT acc.id, imp.id, false, DATE '2020-01-01' + (n % 2190), ((n * 7919) % 200000) - 150000,
            acc.currency, 'perf-' || n, 'Perf ' || n,
            CASE WHEN n % 10 IN (0, 5) OR n % 20 = 1 THEN NULL
                 ELSE (SELECT id FROM cats WHERE cats.position = n % 30) END,
            CASE WHEN n % 20 = 1 THEN (SELECT id FROM transfer LIMIT 1) END
     FROM generate_series(1, $1::int) AS n
     JOIN LATERAL (SELECT id, currency FROM account ORDER BY name OFFSET (n % 3) LIMIT 1) acc
       ON true
     JOIN import imp ON imp.account_id = acc.id`,
    [TRANSACTION_COUNT - accounts.length],
  );
  // Every Transaction ending in 5 is split in two lines: half under the Category it would have
  // had, the rest under the next one (both already in use, so the Category columns don't change).
  await t.ctx.db.query(
    `WITH cats AS (SELECT c.id, row_number() OVER (ORDER BY g.sort, c.sort) - 1 AS position
                  FROM category c JOIN category_group g ON g.id = c.group_id),
     split AS (SELECT id, amount_minor, substring(fingerprint FROM 6)::int AS n
               FROM "transaction" WHERE fingerprint LIKE 'perf-%5')
     INSERT INTO split_line (transaction_id, position, amount_minor, category_id)
     SELECT s.id, line.position,
            CASE line.position WHEN 1 THEN s.amount_minor / 2
                               ELSE s.amount_minor - s.amount_minor / 2 END,
            (SELECT id FROM cats WHERE cats.position = (s.n + line.position - 1) % 30)
     FROM split s CROSS JOIN (VALUES (1), (2)) AS line(position)`,
  );
  await t.ctx.db.query('ANALYZE');
}

const SIX_YEARS_MONTH_BY_CATEGORY: WidgetQueryInput = {
  dateRange: { kind: 'fixed', from: '2020-01-01', to: '2025-12-31' },
  rows: 'month',
  columns: 'category',
  measure: 'sum',
};

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; result: T }> {
  await run(); // warm the plan cache and buffers
  const start = performance.now();
  const result = await run();
  return { ms: performance.now() - start, result };
}

describe('reporting over 6 years and 20k Transactions', () => {
  it('runs month × Category, and drills into a cell, in under 1 s', async () => {
    await seedSixYears();

    const report = await timed(() => runWidgetQuery(t.ctx, SIX_YEARS_MONTH_BY_CATEGORY));
    const drill = await timed(() =>
      listCellTransactions(t.ctx, SIX_YEARS_MONTH_BY_CATEGORY, {
        row: '2023-06',
        column: report.result.columns[0]!.key,
      }),
    );

    expect(report.result.rows).toHaveLength(72);
    // 22 used non-Capital Categories (the seed never assigns 3 of the 30) plus Unclassified.
    expect(report.result.columns).toHaveLength(23);
    expect(report.result.unconvertedCount).toBe(0);
    expect(report.ms).toBeLessThan(BUDGET_MS);
    expect(drill.result.sumChfMinor).toBe(report.result.cells[41]![0]);
    expect(drill.ms).toBeLessThan(BUDGET_MS);
  });
});

import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { createPayee } from '../payees';
import { createTag } from '../tags';
import { createRule } from '.';
import { applyRulesToExisting, countRuleMatches, previewApplyRules } from './existing';

/**
 * Applying Rules to 10 000 Transactions finishes in reasonable time (ticket #18). Measured on
 * Postgres 16 (local, warm), two Rules setting Payee, Category and a Tag on all 10 000:
 * - 2026-10-30: preview 0.8 s, commit 7.8 s (20 000 History inserts, one per Transaction per
 *   Rule), match counts 0.5 s.
 * - 2026-10-31, after batched History (`recordMany`, one INSERT per Rule) and the set-based
 *   Transfer check: preview 0.5 s, commit 3.2 s, match counts 0.5 s.
 * The budgets are generous
 * so a slow CI runner doesn't flake; they catch order-of-magnitude regressions.
 */
const t = setupTestDatabase();

const SIZE = 10_000;
const PREVIEW_BUDGET_MS = 10_000;
const COMMIT_BUDGET_MS = 60_000;

describe('applying Rules to 10 000 Transactions', () => {
  it('previews and commits in one Batch within budget', async () => {
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
    await seedTransactions(t.ctx.db, account, [{ bookingDate: '2021-01-01', amountMinor: 0 }]);
    await t.ctx.db.query(
      `INSERT INTO "transaction" (account_id, import_id, is_manual, booking_date, amount_minor,
         currency, fingerprint, raw_description)
       SELECT $1, imp.id, false, DATE '2021-01-01' + (n % 1800), -n, 'CHF', 'perf-' || n,
              'TWINT MIGROS GENÈVE ' || n
       FROM generate_series(1, $2::int) AS n, import imp`,
      [account.id, SIZE],
    );
    await t.ctx.db.query('ANALYZE "transaction"');
    const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
    const category = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
    const payee = await createPayee(t.ctx, 'Migros');
    const tag = await createTag(t.ctx, 'food');
    await createRule(t.ctx, {
      name: 'Migros payee and category',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'migros' }],
      actions: { payeeId: payee.id, categoryId: category.id, tagIds: [] },
    });
    await createRule(t.ctx, {
      name: 'Out is food',
      conditions: [{ type: 'direction', direction: 'out' }],
      actions: { payeeId: null, categoryId: null, tagIds: [tag.id] },
    });

    let start = performance.now();
    const preview = await previewApplyRules(t.ctx, {});
    const previewMs = performance.now() - start;
    start = performance.now();
    const result = await applyRulesToExisting(t.ctx, {});
    const commitMs = performance.now() - start;
    start = performance.now();
    await countRuleMatches(t.ctx);
    const countMs = performance.now() - start;
    process.stdout.write(
      `apply ${SIZE}: preview ${previewMs.toFixed(0)} ms, commit ${commitMs.toFixed(0)} ms, counts ${countMs.toFixed(0)} ms\n`,
    );

    expect(preview.changedCount).toBe(SIZE);
    expect(result.count).toBe(SIZE);
    const entries = await listHistory(t.ctx, { batchId: result.batchId!, limit: 1 });
    expect(entries).toHaveLength(1);
    expect(previewMs).toBeLessThan(PREVIEW_BUDGET_MS);
    expect(commitMs).toBeLessThan(COMMIT_BUDGET_MS);
  }, 180_000);
});

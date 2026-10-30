import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getBatchSummaries, listHistory } from '../history';
import { createPayee } from '../payees';
import { createTag } from '../tags';
import { getClassification } from '../transactions';
import { createRule, type RuleInput } from '.';
import { applyRulesToExisting, previewApplyRules } from './existing';

const t = setupTestDatabase();

async function account(name = 'Current'): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `Bank ${name}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

async function targets() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const groceries = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
  const migros = await createPayee(t.ctx, 'Migros');
  const food = await createTag(t.ctx, 'food');
  return { groceries, migros, food };
}

const descriptionContains = (value: string): RuleInput['conditions'][number] => ({
  type: 'text',
  field: 'description',
  operator: 'contains',
  value,
});

describe('previewing Rules applied to existing Transactions', () => {
  it('lists which Transactions change, which fields, old to new, and writes nothing', async () => {
    const current = await account();
    const { groceries, migros, food } = await targets();
    const [migrosId] = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: -4520, rawDescription: 'TWINT MIGROS GENEVE' },
      { bookingDate: '2025-10-03', amountMinor: -1200, rawDescription: 'COOP PRONTO' },
    ]);
    await createRule(t.ctx, {
      name: 'Migros',
      conditions: [descriptionContains('migros')],
      actions: { payeeId: migros.id, categoryId: groceries.id, tagIds: [food.id] },
    });
    const historyBefore = await listHistory(t.ctx, {});

    const preview = await previewApplyRules(t.ctx, {});

    expect(preview).toMatchObject({
      examined: 2,
      changedCount: 1,
      fieldCounts: { payee: 1, category: 1, tags: 1 },
      skippedTransfers: 0,
      changes: [
        {
          transactionId: migrosId,
          bookingDate: '2025-10-02',
          accountName: 'Current',
          rawDescription: 'TWINT MIGROS GENEVE',
          amountMinor: -4520,
          currency: 'CHF',
          fields: [
            { field: 'payee', before: null, after: 'Migros', ruleName: 'Migros' },
            { field: 'category', before: null, after: 'Food › Groceries', ruleName: 'Migros' },
            { field: 'tags', before: null, after: 'food', ruleName: 'Migros' },
          ],
        },
      ],
    });
    expect(await getClassification(t.ctx, migrosId!)).toMatchObject({
      payee: null,
      category: null,
      tags: [],
    });
    expect(await listHistory(t.ctx, {})).toEqual(historyBefore);
  });
});

describe('applying Rules to existing Transactions', () => {
  it('writes exactly what the preview showed, as one Batch with a summary and the Rule as actor', async () => {
    const current = await account();
    const { groceries, migros, food } = await targets();
    const coop = await createPayee(t.ctx, 'Coop');
    const ids = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: -4520, rawDescription: 'TWINT MIGROS GENEVE' },
      { bookingDate: '2025-10-03', amountMinor: -1200, rawDescription: 'COOP PRONTO' },
      { bookingDate: '2025-10-04', amountMinor: -990, rawDescription: 'MIGROS EXPRESS' },
    ]);
    const migrosRule = await createRule(t.ctx, {
      name: 'Migros',
      conditions: [descriptionContains('migros')],
      actions: { payeeId: migros.id, categoryId: groceries.id, tagIds: [food.id] },
    });
    const coopRule = await createRule(t.ctx, {
      name: 'Coop',
      conditions: [descriptionContains('coop')],
      actions: { payeeId: coop.id, categoryId: null, tagIds: [] },
    });
    const preview = await previewApplyRules(t.ctx, {});

    const result = await applyRulesToExisting(t.ctx, {});

    expect(result.count).toBe(preview.changedCount);
    for (const change of preview.changes) {
      const now = await getClassification(t.ctx, change.transactionId);
      for (const field of change.fields) {
        const value =
          field.field === 'payee'
            ? now.payee?.name
            : field.field === 'category'
              ? `${now.category?.groupName} › ${now.category?.name}`
              : now.tags.map((tag) => tag.name).join(', ');
        expect(value).toBe(field.after);
      }
      expect(now.lockedFields).toEqual([]);
    }
    expect((await getClassification(t.ctx, ids[1]!)).payee?.name).toBe('Coop');
    const entries = await listHistory(t.ctx, { entityType: 'transaction' });
    expect(new Set(entries.map((entry) => entry.batchId))).toEqual(new Set([result.batchId]));
    expect(
      entries.filter((entry) => entry.entityId === ids[1]).map((entry) => entry.actorId),
    ).toEqual([coopRule.id]);
    expect(
      new Set(entries.filter((entry) => entry.entityId === ids[0]).map((entry) => entry.actorId)),
    ).toEqual(new Set([migrosRule.id]));
    expect(await getBatchSummaries(t.ctx, [result.batchId!])).toEqual({
      [result.batchId!]: 'Applied all Rules to 3 Transactions',
    });
    expect((await previewApplyRules(t.ctx, {})).changedCount).toBe(0);
  });
});

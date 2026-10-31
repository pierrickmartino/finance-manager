import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getBatchSummaries, listHistory } from '../history';
import { createPayee } from '../payees';
import { createTag } from '../tags';
import { linkTransfer } from '../transfers';
import { editClassification, getClassification } from '../transactions';
import { createRule, setRuleEnabled, type RuleInput } from '.';
import {
  applyRulesToExisting,
  countRuleMatches,
  previewApplyRules,
  suggestRuleFromTransaction,
} from './existing';

const t = setupTestDatabase();

/** Links the Transaction with a new opposite one on another Account, as a Transfer. */
async function makeTransfer(transactionId: string, amountMinor: number): Promise<void> {
  const other = await account(`Other side ${transactionId.slice(0, 8)}`);
  const [counterpart] = await seedTransactions(t.ctx.db, other, [
    { bookingDate: '2025-10-02', amountMinor: -amountMinor, rawDescription: 'COUNTERPART' },
  ]);
  await linkTransfer(t.ctx, { transactionIds: [transactionId, counterpart!] });
}

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

describe('what applying Rules leaves alone', () => {
  it('skips locked fields and still writes the unlocked ones', async () => {
    const current = await account();
    const { groceries, migros, food } = await targets();
    const [id] = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: -4520, rawDescription: 'TWINT MIGROS GENEVE' },
    ]);
    await editClassification(t.ctx, id!, { payeeName: 'My grocer' });
    await createRule(t.ctx, {
      name: 'Migros',
      conditions: [descriptionContains('migros')],
      actions: { payeeId: migros.id, categoryId: groceries.id, tagIds: [food.id] },
    });

    const preview = await previewApplyRules(t.ctx, {});
    await applyRulesToExisting(t.ctx, {});

    expect(preview.changes[0]!.fields.map((field) => field.field)).toEqual(['category', 'tags']);
    expect(await getClassification(t.ctx, id!)).toMatchObject({
      payee: { name: 'My grocer' },
      category: { name: 'Groceries' },
      tags: [{ name: 'food', source: 'rule' }],
      lockedFields: ['payee'],
    });
  });

  it('skips Transactions in a Transfer', async () => {
    const current = await account();
    const { groceries } = await targets();
    const [inTransfer, plain] = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: -50000, rawDescription: 'TRANSFER TO SAVINGS' },
      { bookingDate: '2025-10-03', amountMinor: -100, rawDescription: 'TRANSFER FEE' },
    ]);
    await makeTransfer(inTransfer!, -50000);
    await createRule(t.ctx, {
      name: 'Transfers',
      conditions: [descriptionContains('transfer')],
      actions: { payeeId: null, categoryId: groceries.id, tagIds: [] },
    });

    const preview = await previewApplyRules(t.ctx, {});
    const result = await applyRulesToExisting(t.ctx, {});

    // The Transfer's other side is examined and skipped too.
    expect(preview).toMatchObject({ examined: 3, changedCount: 1, skippedTransfers: 2 });
    expect(result.count).toBe(1);
    expect((await getClassification(t.ctx, inTransfer!)).category).toBeNull();
    expect((await getClassification(t.ctx, plain!)).category?.name).toBe('Groceries');
  });

  it('applies only the chosen Rule, even a disabled one, to the filtered Transactions', async () => {
    const current = await account('Current');
    const savings = await account('Savings');
    const { groceries, migros } = await targets();
    const [here] = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: -4520, rawDescription: 'TWINT MIGROS GENEVE' },
    ]);
    const [there] = await seedTransactions(t.ctx.db, savings, [
      { bookingDate: '2025-10-02', amountMinor: -4520, rawDescription: 'TWINT MIGROS GENEVE' },
    ]);
    await createRule(t.ctx, {
      name: 'Payee',
      conditions: [descriptionContains('migros')],
      actions: { payeeId: migros.id, categoryId: null, tagIds: [] },
    });
    const categoryRule = await createRule(t.ctx, {
      name: 'Category',
      conditions: [descriptionContains('migros')],
      actions: { payeeId: null, categoryId: groceries.id, tagIds: [] },
    });
    await setRuleEnabled(t.ctx, categoryRule.id, false);
    const input = { ruleIds: [categoryRule.id], filter: { accountId: current.id } };

    expect(await previewApplyRules(t.ctx, input)).toMatchObject({
      examined: 1,
      changedCount: 1,
      fieldCounts: { payee: 0, category: 1, tags: 0 },
    });
    const result = await applyRulesToExisting(t.ctx, input);

    expect(await getClassification(t.ctx, here!)).toMatchObject({
      payee: null,
      category: { name: 'Groceries' },
    });
    expect((await getClassification(t.ctx, there!)).category).toBeNull();
    expect(await getBatchSummaries(t.ctx, [result.batchId!])).toEqual({
      [result.batchId!]: 'Applied Rule "Category" to 1 Transaction',
    });
  });

  it('writes nothing and makes no Batch when nothing would change', async () => {
    await account();
    const result = await applyRulesToExisting(t.ctx, {});

    expect(result).toEqual({ batchId: null, count: 0 });
    expect(await listHistory(t.ctx, { entityType: 'transaction' })).toEqual([]);
  });

  it('refuses an unknown Rule', async () => {
    await expect(
      previewApplyRules(t.ctx, { ruleIds: ['00000000-0000-4000-8000-000000000000'] }),
    ).rejects.toThrow('Rule not found');
  });
});

describe('Rule match counts', () => {
  it('counts the Transactions each Rule matches now, enabled or not, Transfers excluded', async () => {
    const current = await account();
    const { groceries } = await targets();
    const ids = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: -4520, rawDescription: 'TWINT MIGROS GENEVE' },
      { bookingDate: '2025-10-03', amountMinor: -990, rawDescription: 'MIGROS EXPRESS' },
      { bookingDate: '2025-10-04', amountMinor: 250000, rawDescription: 'SALARY' },
      { bookingDate: '2025-10-05', amountMinor: -300, rawDescription: 'MIGROS TRANSFER' },
    ]);
    await makeTransfer(ids[3]!, -300);
    const actions = { payeeId: null, categoryId: groceries.id, tagIds: [] };
    const migrosRule = await createRule(t.ctx, {
      name: 'Migros',
      conditions: [descriptionContains('migros')],
      actions,
    });
    const outRule = await createRule(t.ctx, {
      name: 'Out',
      conditions: [{ type: 'direction', direction: 'out' }],
      actions,
    });
    const deadRule = await createRule(t.ctx, {
      name: 'Dead',
      conditions: [descriptionContains('nothing like this')],
      actions,
    });
    await setRuleEnabled(t.ctx, outRule.id, false);

    expect(await countRuleMatches(t.ctx)).toEqual({
      [migrosRule.id]: 2,
      [outRule.id]: 2,
      [deadRule.id]: 0,
    });
  });
});

describe('a Rule suggested from a Transaction', () => {
  it('matches its Account, a description fragment and direction, and sets its classification', async () => {
    const current = await account();
    const { groceries, food } = await targets();
    const [id] = await seedTransactions(t.ctx.db, current, [
      {
        bookingDate: '2025-10-02',
        amountMinor: -4520,
        rawDescription: '  TWINT  Migros Genève 02.10.2025 Karte 1234 ',
      },
    ]);
    await editClassification(t.ctx, id!, {
      payeeName: 'Migros',
      categoryId: groceries.id,
      tagIds: [food.id],
    });

    const suggestion = await suggestRuleFromTransaction(t.ctx, id!);

    expect(suggestion).toEqual({
      name: 'twint migros geneve',
      enabled: true,
      conditions: [
        { type: 'account', accountIds: [current.id] },
        { type: 'text', field: 'description', operator: 'contains', value: 'twint migros geneve' },
        { type: 'direction', direction: 'out' },
      ],
      actions: {
        payeeId: (await getClassification(t.ctx, id!)).payee!.id,
        categoryId: groceries.id,
        tagIds: [food.id],
      },
    });
    const rule = await createRule(t.ctx, suggestion);
    expect((await countRuleMatches(t.ctx))[rule.id]).toBe(1);
  });

  it('leaves out the description when it has no words, and suggests nothing to set when Unclassified', async () => {
    const current = await account();
    const [id] = await seedTransactions(t.ctx.db, current, [
      { bookingDate: '2025-10-02', amountMinor: 1000, rawDescription: '0042 / 1234' },
    ]);

    expect(await suggestRuleFromTransaction(t.ctx, id!)).toEqual({
      name: 'Current, money in',
      enabled: true,
      conditions: [
        { type: 'account', accountIds: [current.id] },
        { type: 'direction', direction: 'in' },
      ],
      actions: { payeeId: null, categoryId: null, tagIds: [] },
    });
  });

  it('refuses an unknown Transaction', async () => {
    await expect(suggestRuleFromTransaction(t.ctx, 'nope')).rejects.toThrow(
      'Transaction not found',
    );
  });
});

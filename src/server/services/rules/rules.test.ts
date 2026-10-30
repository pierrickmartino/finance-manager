import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, deleteCategory, mergeCategory } from '../categories';
import { listHistory } from '../history';
import { createPayee, deletePayee, mergePayees } from '../payees';
import { createTag, deleteTag, mergeTags } from '../tags';
import { getClassification } from '../transactions';
import { createManualTransaction } from '../transactions/manual';
import {
  createRule,
  deleteRule,
  getRule,
  listRules,
  reorderRules,
  setRuleEnabled,
  updateRule,
  type RuleInput,
} from '.';

const t = setupTestDatabase();

/** A Tag for Rules whose actions don't matter to the test. */
let shoppingTagId = '';
beforeEach(async () => {
  shoppingTagId = (await createTag(t.ctx, 'shopping')).id;
});

const migrosRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  name: 'Migros',
  conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'migros' }],
  actions: { tagIds: [shoppingTagId] },
  ...overrides,
});

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

async function account() {
  const bank = await createBank(t.ctx, { name: `Bank ${Math.random()}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Cash',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: null,
    openingBalanceMinor: 0,
  });
}

describe('manage Rules', () => {
  it('creates Rules in run order, enabled, and records them in History', async () => {
    const payee = await createPayee(t.ctx, 'Migros');
    const first = await createRule(t.ctx, migrosRule({ actions: { payeeId: payee.id } }));
    const second = await createRule(t.ctx, migrosRule({ name: 'Coop' }));

    expect(first).toMatchObject({
      name: 'Migros',
      enabled: true,
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'migros' }],
      actions: { payeeId: payee.id, categoryId: null, tagIds: [] },
    });
    expect((await listRules(t.ctx)).map((rule) => rule.id)).toEqual([first.id, second.id]);
    expect(await listHistory(t.ctx, { entityType: 'rule', entityId: first.id })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name', after: 'Migros' })]),
    );
  });

  it('accepts every kind of condition', async () => {
    const cash = await account();
    const rule = await createRule(
      t.ctx,
      migrosRule({
        conditions: [
          { type: 'text', field: 'counterparty', operator: 'regex', value: '^migros\\b' },
          { type: 'amount', operator: 'between', amountMinor: -10000, toAmountMinor: -100 },
          { type: 'account', accountIds: [cash.id] },
          { type: 'direction', direction: 'out' },
          { type: 'bookingDate', operator: 'after', date: '2025-01-01' },
        ],
      }),
    );

    expect(rule.conditions).toHaveLength(5);
  });

  it.each([
    [{ conditions: [] }, /at least one condition/i],
    [
      { conditions: [{ type: 'text', field: 'description', operator: 'regex', value: '(a+)+' }] },
      /nested repetition/i,
    ],
    [
      { conditions: [{ type: 'text', field: 'description', operator: 'regex', value: '[' }] },
      /not a valid regular expression/i,
    ],
    [
      { conditions: [{ type: 'text', field: 'description', operator: 'contains', value: ' ' }] },
      /text is required/i,
    ],
    [
      {
        conditions: [{ type: 'amount', operator: 'between', amountMinor: 500, toAmountMinor: 100 }],
      },
      /lowest amount first/i,
    ],
    [
      {
        conditions: [
          { type: 'bookingDate', operator: 'between', date: '2025-02-01', toDate: '2025-01-01' },
        ],
      },
      /earliest date first/i,
    ],
    [{ name: ' ' }, /name is required/i],
    [{ actions: { payeeId: '00000000-0000-4000-8000-000000000000' } }, /payee not found/i],
  ] as const)('refuses a Rule with %o', async (overrides, message) => {
    await expect(createRule(t.ctx, migrosRule(overrides as Partial<RuleInput>))).rejects.toThrow(
      message,
    );
    expect(await listRules(t.ctx)).toEqual([]);
  });

  it('refuses a Rule that does nothing', async () => {
    await expect(
      createRule(t.ctx, migrosRule({ actions: { payeeId: null, categoryId: null, tagIds: [] } })),
    ).rejects.toThrow(/at least one action/i);
  });

  it('edits, disables, reorders and deletes Rules', async () => {
    const category = await groceries();
    const first = await createRule(t.ctx, migrosRule({ actions: { categoryId: category.id } }));
    const second = await createRule(
      t.ctx,
      migrosRule({ name: 'Coop', actions: { categoryId: category.id } }),
    );

    const edited = await updateRule(
      t.ctx,
      first.id,
      migrosRule({
        name: 'Migros stores',
        actions: { categoryId: category.id },
      }),
    );
    expect(edited.name).toBe('Migros stores');

    expect((await setRuleEnabled(t.ctx, first.id, false)).enabled).toBe(false);

    await reorderRules(t.ctx, [second.id, first.id]);
    expect((await listRules(t.ctx)).map((rule) => rule.id)).toEqual([second.id, first.id]);

    await deleteRule(t.ctx, second.id);
    expect((await listRules(t.ctx)).map((rule) => rule.id)).toEqual([first.id]);
    await expect(getRule(t.ctx, second.id)).rejects.toThrow(/rule not found/i);
  });

  it('refuses a reorder that does not list every Rule once', async () => {
    const first = await createRule(t.ctx, migrosRule());
    await createRule(t.ctx, migrosRule());

    await expect(reorderRules(t.ctx, [first.id])).rejects.toThrow(/every Rule/i);
  });

  it('leaves existing Transactions unchanged when a Rule is edited', async () => {
    const category = await groceries();
    const cash = await account();
    const rule = await createRule(t.ctx, migrosRule({ actions: { categoryId: category.id } }));
    const saved = await createManualTransaction(t.ctx, {
      accountId: cash.id,
      bookingDate: '2025-10-03',
      amountMinor: -4590,
      description: 'Migros Genève',
    });
    const before = await getClassification(t.ctx, saved.id);
    expect(before.category?.id).toBe(category.id);

    const other = await createCategory(t.ctx, { groupId: category.groupId, name: 'Shopping' });
    await updateRule(t.ctx, rule.id, migrosRule({ actions: { categoryId: other.id } }));
    await setRuleEnabled(t.ctx, rule.id, false);
    await deleteRule(t.ctx, rule.id);

    expect(await getClassification(t.ctx, saved.id)).toEqual(before);
  });
});

describe('Rules follow merged and deleted Payees, Categories and Tags', () => {
  it('points a Rule at the Payee, Category or Tag something was merged into', async () => {
    const source = await createPayee(t.ctx, 'Migros SA');
    const target = await createPayee(t.ctx, 'Migros');
    const category = await groceries();
    const otherCategory = await createCategory(t.ctx, { groupId: category.groupId, name: 'Food' });
    const oldTag = await createTag(t.ctx, 'food');
    const newTag = await createTag(t.ctx, 'Food & drink');
    const keptTag = await createTag(t.ctx, 'weekly');
    const rule = await createRule(
      t.ctx,
      migrosRule({
        actions: { payeeId: source.id, categoryId: category.id, tagIds: [oldTag.id, keptTag.id] },
      }),
    );

    await mergePayees(t.ctx, source.id, target.id);
    await mergeCategory(t.ctx, category.id, otherCategory.id);
    await mergeTags(t.ctx, oldTag.id, newTag.id);

    expect((await getRule(t.ctx, rule.id)).actions).toEqual({
      payeeId: target.id,
      categoryId: otherCategory.id,
      tagIds: [newTag.id, keptTag.id],
    });
    const history = await listHistory(t.ctx, { entityType: 'rule', entityId: rule.id });
    expect(
      history.filter((entry) => entry.field === 'actions' && entry.before !== null),
    ).toHaveLength(3);
  });

  it('drops a merged Tag the Rule already adds under its new name', async () => {
    const oldTag = await createTag(t.ctx, 'food');
    const newTag = await createTag(t.ctx, 'Food & drink');
    const rule = await createRule(
      t.ctx,
      migrosRule({ actions: { tagIds: [oldTag.id, newTag.id] } }),
    );

    await mergeTags(t.ctx, oldTag.id, newTag.id);

    expect((await getRule(t.ctx, rule.id)).actions.tagIds).toEqual([newTag.id]);
  });

  it('takes a deleted Tag off Rules', async () => {
    const tag = await createTag(t.ctx, 'food');
    const payee = await createPayee(t.ctx, 'Migros');
    const rule = await createRule(
      t.ctx,
      migrosRule({ actions: { payeeId: payee.id, tagIds: [tag.id] } }),
    );

    await deleteTag(t.ctx, tag.id);

    expect((await getRule(t.ctx, rule.id)).actions.tagIds).toEqual([]);
  });

  it('refuses to delete a Payee or Category a Rule sets', async () => {
    const payee = await createPayee(t.ctx, 'Migros');
    const category = await groceries();
    await createRule(
      t.ctx,
      migrosRule({ name: 'Groceries', actions: { payeeId: payee.id, categoryId: category.id } }),
    );

    await expect(deletePayee(t.ctx, payee.id)).rejects.toThrow(/Rule "Groceries"/);
    await expect(deleteCategory(t.ctx, category.id)).rejects.toThrow(/Rule "Groceries"/);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { commitImport, listImportTransactions, previewImport } from '../imports';
import { createPayee } from '../payees';
import { createTag } from '../tags';
import { editClassification, getClassification } from '../transactions';
import { createManualTransaction, updateManualTransaction } from '../transactions/manual';
import { createRule, setRuleEnabled, type RuleInput } from '.';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const UBS_OCTOBER = 'ubs/ubs-chf-2025-10.csv';

async function ubsAccount(): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'UBS' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'UBS current',
    currency: 'CHF',
    iban: 'CH6900235235123456010',
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

async function cashAccount(): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'Cash' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Wallet',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: null,
    openingBalanceMinor: 0,
  });
}

async function previewOctober(account: Account) {
  return previewImport(t.ctx, {
    accountId: account.id,
    fileName: path.basename(UBS_OCTOBER),
    content: readFileSync(path.join(FIXTURES, UBS_OCTOBER)),
  });
}

async function classificationTargets() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const groceries = await createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
  const eatingOut = await createCategory(t.ctx, { groupId: group.id, name: 'Eating out' });
  const migros = await createPayee(t.ctx, 'Migros');
  const food = await createTag(t.ctx, 'food');
  const card = await createTag(t.ctx, 'card');
  return { groceries, eatingOut, migros, food, card };
}

const descriptionContains = (value: string): RuleInput['conditions'][number] => ({
  type: 'text',
  field: 'description',
  operator: 'contains',
  value,
});

describe('Rules in the import preview', () => {
  it('shows the Payee, Category and Tags each new entry gets, and which Rule set each', async () => {
    const account = await ubsAccount();
    const { groceries, eatingOut, migros, food, card } = await classificationTargets();
    const migrosRule = await createRule(t.ctx, {
      name: 'Migros groceries',
      conditions: [descriptionContains('MIGROS exemple'), { type: 'direction', direction: 'out' }],
      actions: { payeeId: migros.id, categoryId: groceries.id, tagIds: [food.id] },
    });
    const cardRule = await createRule(t.ctx, {
      name: 'Card payments',
      conditions: [descriptionContains('paiement carte de debit')],
      actions: { categoryId: eatingOut.id, tagIds: [card.id, food.id] },
    });

    const preview = await previewOctober(account);

    const byReference = new Map(preview.entries.map((e) => [e.bankReference, e.classification]));
    expect(byReference.get('9930275TI0000102')).toEqual({
      payee: { id: migros.id, name: 'Migros', ruleId: migrosRule.id, ruleName: 'Migros groceries' },
      category: {
        id: groceries.id,
        name: 'Food › Groceries',
        ruleId: migrosRule.id,
        ruleName: 'Migros groceries',
      },
      tags: [
        { id: food.id, name: 'food', ruleId: migrosRule.id, ruleName: 'Migros groceries' },
        { id: card.id, name: 'card', ruleId: cardRule.id, ruleName: 'Card payments' },
      ],
    });
    // Coop: only the card Rule matches; it fills the Category no earlier Rule set.
    expect(byReference.get('9930276TI0000103')).toMatchObject({
      payee: null,
      category: { id: eatingOut.id, ruleId: cardRule.id },
      tags: [{ id: card.id }, { id: food.id }],
    });
    expect(byReference.get('9930274TI0000101')).toEqual({ payee: null, category: null, tags: [] });
  });

  it('ignores disabled Rules', async () => {
    const account = await ubsAccount();
    const { groceries } = await classificationTargets();
    const rule = await createRule(t.ctx, {
      name: 'Migros',
      conditions: [descriptionContains('migros')],
      actions: { categoryId: groceries.id },
    });
    await setRuleEnabled(t.ctx, rule.id, false);

    const preview = await previewOctober(account);

    expect(preview.entries.every((entry) => entry.classification?.category === null)).toBe(true);
  });

  it('applies the classification on commit, recorded in the Import Batch with the Rule as actor', async () => {
    const account = await ubsAccount();
    const { groceries, migros, food } = await classificationTargets();
    const rule = await createRule(t.ctx, {
      name: 'Migros',
      conditions: [
        descriptionContains('migros'),
        { type: 'amount', operator: 'lessThan', amountMinor: -5000 },
      ],
      actions: { payeeId: migros.id, categoryId: groceries.id, tagIds: [food.id] },
    });
    const preview = await previewOctober(account);

    const committed = await commitImport(t.ctx, { previewId: preview.id });

    const transactions = await listImportTransactions(t.ctx, committed.id);
    const big = transactions.find((tr) => tr.bankReference === '9930275TI0000102')!;
    const small = transactions.find((tr) => tr.bankReference === '9930293TI0000109')!;
    expect(await getClassification(t.ctx, big.id)).toMatchObject({
      payee: { id: migros.id },
      category: { id: groceries.id },
      tags: [{ id: food.id, source: 'rule' }],
      lockedFields: [],
    });
    expect(await getClassification(t.ctx, small.id)).toMatchObject({ payee: null, category: null });

    const history = await listHistory(t.ctx, { entityType: 'transaction', entityId: big.id });
    const created = history.find((entry) => entry.field === 'amountMinor')!;
    const byRule = history.filter((entry) => entry.actorType === 'rule');
    expect(created).toMatchObject({ actorType: 'import', actorId: committed.id });
    expect(byRule.map((entry) => entry.field).sort()).toEqual(['category', 'payee', 'tags']);
    expect(byRule.every((e) => e.actorId === rule.id && e.batchId === created.batchId)).toBe(true);
  });
});

describe('Rules when a Manual transaction is saved', () => {
  it('classifies a new Manual transaction, recorded in the save Batch with the Rule as actor', async () => {
    const account = await cashAccount();
    const { groceries, migros } = await classificationTargets();
    const rule = await createRule(t.ctx, {
      name: 'Migros',
      conditions: [
        descriptionContains('migros'),
        { type: 'account', accountIds: [account.id] },
        { type: 'bookingDate', operator: 'between', date: '2025-10-01', toDate: '2025-10-31' },
      ],
      actions: { payeeId: migros.id, categoryId: groceries.id },
    });

    const saved = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-03',
      amountMinor: -4590,
      description: 'Migrös  Plainpalais',
    });

    expect(await getClassification(t.ctx, saved.id)).toMatchObject({
      payee: { id: migros.id },
      category: { id: groceries.id },
    });
    const history = await listHistory(t.ctx, { entityType: 'transaction', entityId: saved.id });
    const manual = history.find((entry) => entry.actorType === 'manual')!;
    const byRule = history.filter((entry) => entry.actorType === 'rule');
    expect(byRule).toHaveLength(2);
    expect(byRule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'payee', actorId: rule.id, batchId: manual.batchId }),
        expect.objectContaining({ field: 'category', actorId: rule.id, batchId: manual.batchId }),
      ]),
    );
  });

  it('never writes a locked field when the Manual transaction is saved again', async () => {
    const account = await cashAccount();
    const { groceries, eatingOut, migros, food } = await classificationTargets();
    await createRule(t.ctx, {
      name: 'Migros',
      conditions: [descriptionContains('migros')],
      actions: { payeeId: migros.id, categoryId: groceries.id, tagIds: [food.id] },
    });
    const saved = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-03',
      amountMinor: -4590,
      description: 'Lunch',
    });
    await editClassification(t.ctx, saved.id, { categoryId: eatingOut.id });

    await updateManualTransaction(t.ctx, saved.id, {
      bookingDate: '2025-10-03',
      amountMinor: -4590,
      description: 'Lunch at Migros restaurant',
    });

    expect(await getClassification(t.ctx, saved.id)).toMatchObject({
      payee: { id: migros.id },
      category: { id: eatingOut.id },
      tags: [{ id: food.id, source: 'rule' }],
      lockedFields: ['category'],
    });
  });
});

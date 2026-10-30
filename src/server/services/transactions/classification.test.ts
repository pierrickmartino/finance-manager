import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { mutate } from '../context';
import { listHistory } from '../history';
import {
  applyClassification,
  editClassification,
  getClassification,
  unlockFields,
} from './classification';

const t = setupTestDatabase();

async function transaction(isManual = false): Promise<string> {
  const bank = await createBank(t.ctx, { name: `Bank ${Math.random()}` });
  const account = await createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
  const [id] = await seedTransactions(t.ctx.db, account, [
    { bookingDate: '2025-10-03', amountMinor: -4590, rawDescription: 'MIGROS GENEVE', isManual },
  ]);
  return id!;
}

async function category(name = 'Groceries', groupName = 'Food') {
  const group = await createCategoryGroup(t.ctx, { name: groupName, type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name });
}

describe('edit classification', () => {
  it('sets the Payee, Category, Tags and notes, creating new Payees and Tags by name', async () => {
    const id = await transaction();
    const groceries = await category();

    const result = await editClassification(t.ctx, id, {
      payeeName: 'Migros',
      categoryId: groceries.id,
      tagNames: ['Vacation 2024', 'Family', 'family'],
      notes: '  weekly shop ',
    });

    expect(result).toMatchObject({
      transactionId: id,
      payee: { name: 'Migros' },
      category: { id: groceries.id, name: 'Groceries', groupName: 'Food', groupType: 'expense' },
      tags: [
        { name: 'Family', source: 'manual' },
        { name: 'Vacation 2024', source: 'manual' },
      ],
      notes: 'weekly shop',
    });
    expect(await getClassification(t.ctx, id)).toEqual(result);
  });

  it('locks exactly the edited fields', async () => {
    const id = await transaction();
    const groceries = await category();

    const first = await editClassification(t.ctx, id, { categoryId: groceries.id });
    expect(first.lockedFields).toEqual(['category']);

    const second = await editClassification(t.ctx, id, { notes: 'shared', payeeName: 'Coop' });
    expect(second.lockedFields).toEqual(['payee', 'category', 'notes']);
    expect(second.category?.id).toBe(groceries.id);
  });

  it('locks a field that is cleared, and replaces the Tags', async () => {
    const id = await transaction();
    const groceries = await category();
    await editClassification(t.ctx, id, { categoryId: groceries.id, tagNames: ['A', 'B'] });

    const result = await editClassification(t.ctx, id, { categoryId: null, tagNames: ['B'] });

    expect(result).toMatchObject({
      category: null,
      tags: [{ name: 'B' }],
      lockedFields: ['category', 'tags'],
    });
  });

  it('records one Batch with the Transaction change and the Payee it created', async () => {
    const id = await transaction();
    const groceries = await category();

    await editClassification(t.ctx, id, { payeeName: 'Migros', categoryId: groceries.id });

    const [latest] = await listHistory(t.ctx, { entityId: id });
    const batch = await listHistory(t.ctx, { batchId: latest!.batchId });
    expect(batch.map((entry) => [entry.entityType, entry.field, entry.after])).toEqual([
      ['transaction', 'lockedFields', ['payee', 'category']],
      ['transaction', 'category', 'Food › Groceries'],
      ['transaction', 'payee', 'Migros'],
      ['payee', 'name', 'Migros'],
    ]);
  });

  it('works on Manual transactions too', async () => {
    const id = await transaction(true);

    expect(await editClassification(t.ctx, id, { payeeName: 'Landlord' })).toMatchObject({
      payee: { name: 'Landlord' },
    });
  });

  it('refuses bank field changes, unknown references and contradictory input', async () => {
    const id = await transaction();
    const missing = '00000000-0000-4000-8000-000000000000';

    await expect(
      editClassification(t.ctx, id, { amountMinor: 1 } as never),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringContaining('amount') });
    await expect(editClassification(t.ctx, id, { categoryId: missing })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(editClassification(t.ctx, id, { payeeId: missing })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(editClassification(t.ctx, id, { tagIds: [missing] })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      editClassification(t.ctx, id, { payeeId: missing, payeeName: 'X' }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(editClassification(t.ctx, missing, { notes: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await getClassification(t.ctx, id)).lockedFields).toEqual([]);
  });
});

describe('unlock fields', () => {
  it('hands fields back to the Rules, keeping their values', async () => {
    const id = await transaction();
    const groceries = await category();
    await editClassification(t.ctx, id, { categoryId: groceries.id, notes: 'n' });

    const result = await unlockFields(t.ctx, id, ['category']);

    expect(result).toMatchObject({ lockedFields: ['notes'], category: { id: groceries.id } });
    expect((await listHistory(t.ctx, { entityId: id }))[0]).toMatchObject({
      field: 'lockedFields',
      before: ['category', 'notes'],
      after: ['notes'],
    });
    await expect(unlockFields(t.ctx, id, ['colour' as 'tags'])).rejects.toMatchObject({
      code: 'validation',
    });
  });
});

describe('applying a classification as a Rule', () => {
  it('skips locked fields, locks nothing and adds Tags', async () => {
    const id = await transaction();
    const groceries = await category();
    const restaurants = await category('Restaurants', 'Eating out');
    await editClassification(t.ctx, id, { categoryId: groceries.id, tagNames: ['Mine'] });
    await unlockFields(t.ctx, id, ['tags']);

    const result = await mutate(t.withActor({ type: 'rule', id: 'rule-1' }), (scope) =>
      applyClassification(
        scope,
        id,
        { categoryId: restaurants.id, payeeName: 'Migros', tagNames: ['Auto'] },
        { by: 'rule' },
      ),
    );

    expect(result).toMatchObject({
      payee: { name: 'Migros' },
      category: { id: groceries.id },
      tags: [
        { name: 'Auto', source: 'rule' },
        { name: 'Mine', source: 'manual' },
      ],
      lockedFields: ['category'],
    });
  });
});

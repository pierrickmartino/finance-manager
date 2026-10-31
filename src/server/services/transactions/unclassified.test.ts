import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { editClassification } from './classification';
import {
  getClassificationProgress,
  listUnclassifiedGroups,
  listUnclassifiedGroupTransactions,
} from './unclassified';

const t = setupTestDatabase();

async function seed(rows: SeedTransaction[]): Promise<string[]> {
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
  return seedTransactions(t.ctx.db, account, rows);
}

const row = (rawDescription: string, bookingDate = '2025-10-03'): SeedTransaction => ({
  bookingDate,
  amountMinor: -1000,
  rawDescription,
});

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

describe('Unclassified groups', () => {
  it('groups by normalised raw description, largest group first', async () => {
    await seed([
      row('TWINT  Migros Genève'),
      row('twint migros geneve '),
      row('TWINT MIGROS GENÈVE', '2025-10-05'),
      row('Swisscom'),
      row('CAFÉ DU MARCHÉ'),
      row('Cafe du marche'),
    ]);

    const page = await listUnclassifiedGroups(t.ctx);

    expect(page.groups.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: 'twint migros geneve', count: 3 },
      { key: 'cafe du marche', count: 2 },
      { key: 'swisscom', count: 1 },
    ]);
    expect(page.groups[0]).toMatchObject({ latestBookingDate: '2025-10-05' });
    expect(page.totalGroups).toBe(3);
  });

  it('leaves out categorised Transactions', async () => {
    const [first] = await seed([row('MIGROS'), row('MIGROS'), row('COOP')]);
    const category = await groceries();
    await editClassification(t.ctx, first!, { categoryId: category.id });

    const page = await listUnclassifiedGroups(t.ctx);

    expect(page.groups.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: 'coop', count: 1 },
      { key: 'migros', count: 1 },
    ]);
  });

  it("lists a group's Transactions, newest first", async () => {
    const [older, newer] = await seed([
      row('Migros', '2025-10-01'),
      row('MIGROS', '2025-10-09'),
      row('Coop'),
    ]);

    const { transactions, total } = await listUnclassifiedGroupTransactions(t.ctx, 'migros');

    expect(total).toBe(2);
    expect(transactions.map((transaction) => transaction.id)).toEqual([newer, older]);
    expect(transactions[0]).toMatchObject({ accountName: 'Current', category: null });
  });

  it('pages through groups', async () => {
    await seed([row('A'), row('A'), row('A'), row('B'), row('B'), row('C')]);

    const page = await listUnclassifiedGroups(t.ctx, { page: 2, pageSize: 2 });

    expect(page.groups.map((group) => group.key)).toEqual(['c']);
    expect(page).toMatchObject({ page: 2, pageSize: 2, pageCount: 2, totalGroups: 3 });
  });
});

describe('Classification progress', () => {
  it('is the share of Transactions Unclassified, against the 2% target', async () => {
    const ids = await seed(Array.from({ length: 8 }, (_, index) => row(`Shop ${index}`)));
    const category = await groceries();
    for (const id of ids.slice(0, 6))
      await editClassification(t.ctx, id, { categoryId: category.id });

    expect(await getClassificationProgress(t.ctx)).toEqual({
      total: 8,
      unclassified: 2,
      share: 0.25,
      target: 0.02,
      isTargetMet: false,
    });
  });

  it('meets the target with no Transactions at all', async () => {
    expect(await getClassificationProgress(t.ctx)).toEqual({
      total: 0,
      unclassified: 0,
      share: 0,
      target: 0.02,
      isTargetMet: true,
    });
  });
});

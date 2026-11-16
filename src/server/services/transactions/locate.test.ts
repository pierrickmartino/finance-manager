import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { NotFoundError } from '../errors';
import { editClassification } from './classification';
import { locateTransaction } from '.';

const t = setupTestDatabase();

async function account(name = 'Current') {
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

async function seed(rows: SeedTransaction[], into?: { id: string; currency: string }) {
  return seedTransactions(t.ctx.db, into ?? (await account()), rows);
}

/** One Transaction per day of October 2025, from the 1st; the list shows them newest first. */
function days(count: number): SeedTransaction[] {
  return Array.from({ length: count }, (_, i) => ({
    bookingDate: `2025-10-${String(i + 1).padStart(2, '0')}`,
    amountMinor: -(i + 1) * 100,
    rawDescription: `DAY ${i + 1}`,
  }));
}

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

describe('locateTransaction', () => {
  it('gives the position, total and neighbours in the unfiltered list, newest first', async () => {
    const [oct1, oct2, oct3] = await seed(days(3));

    const place = await locateTransaction(t.ctx, {}, oct2!);

    expect(place).toEqual({
      matches: true,
      position: 2,
      total: 3,
      previousId: oct3,
      nextId: oct1,
      page: 1,
    });
  });

  it('has no previous on the first Transaction and no next on the last', async () => {
    const [oct1, oct2, oct3] = await seed(days(3));

    const first = await locateTransaction(t.ctx, {}, oct3!);
    const last = await locateTransaction(t.ctx, {}, oct1!);

    expect([first.position, first.previousId, first.nextId]).toEqual([1, null, oct2]);
    expect([last.position, last.previousId, last.nextId]).toEqual([3, oct2, null]);
  });

  it('orders Transactions on one booking date by entry order, the latest entered first', async () => {
    const [a, b, c] = await seed([
      { bookingDate: '2025-10-05', amountMinor: -100 },
      { bookingDate: '2025-10-05', amountMinor: -200 },
      { bookingDate: '2025-10-05', amountMinor: -300 },
    ]);

    const place = await locateTransaction(t.ctx, {}, b!);

    expect(place).toMatchObject({ position: 2, previousId: c, nextId: a });
  });

  it('steps among the Transactions matching the filter only', async () => {
    const category = await groceries();
    const [oct1, oct2, oct3, oct4] = await seed(days(4));
    await editClassification(t.ctx, oct2!, { categoryId: category.id });

    const place = await locateTransaction(t.ctx, { unclassified: true }, oct3!);

    expect(place).toEqual({
      matches: true,
      position: 2,
      total: 3,
      previousId: oct4,
      nextId: oct1,
      page: 1,
    });
  });

  it('gives the neighbours of a Transaction that stopped matching, without a position', async () => {
    const category = await groceries();
    const [oct1, oct2, oct3] = await seed(days(3));
    await editClassification(t.ctx, oct2!, { categoryId: category.id });

    const place = await locateTransaction(t.ctx, { unclassified: true }, oct2!);

    expect(place).toEqual({
      matches: false,
      position: null,
      total: 2,
      previousId: oct3,
      nextId: oct1,
      page: 1,
    });
  });

  it('places a Transaction from another Account by its booking date among the filtered ones', async () => {
    const current = await account('Current');
    const savings = await account('Savings');
    const [, oct2, oct3] = await seed(days(3), current);
    // Entered after Current's Oct 2, so it comes before it in the list's order.
    const [other] = await seed([{ bookingDate: '2025-10-02', amountMinor: 500 }], savings);

    const place = await locateTransaction(t.ctx, { accountId: current.id }, other!);

    expect(place).toMatchObject({
      matches: false,
      position: null,
      total: 3,
      previousId: oct3,
      nextId: oct2,
    });
  });

  it('combines the filters: Account, Unclassified and a date range', async () => {
    const category = await groceries();
    const current = await account('Current');
    const savings = await account('Savings');
    const ids = await seed(days(6), current);
    await seed(days(6), savings);
    await editClassification(t.ctx, ids[3]!, { categoryId: category.id });

    // Oct 2..5 on Current, Unclassified: Oct 5, 3, 2 (Oct 4 is classified).
    const place = await locateTransaction(
      t.ctx,
      { accountId: current.id, unclassified: true, from: '2025-10-02', to: '2025-10-05' },
      ids[2]!,
    );

    expect(place).toEqual({
      matches: true,
      position: 2,
      total: 3,
      previousId: ids[4],
      nextId: ids[1],
      page: 1,
    });
  });

  it('gives the list page the Transaction sits on, at the page size', async () => {
    const ids = await seed(days(5));
    // Newest first at 2 per page: Oct 5, 4 | Oct 3, 2 | Oct 1.
    const pages = await Promise.all(
      ids.map(async (id) => (await locateTransaction(t.ctx, { pageSize: 2 }, id)).page),
    );

    expect(pages).toEqual([3, 2, 2, 1, 1]);
  });

  it('puts the 50th Transaction on page 1 and the 51st on page 2 at the default page size', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      bookingDate: '2025-10-01',
      amountMinor: -(i + 1),
    }));
    const ids = await seed(rows);

    // Same date, so the latest entered comes first: ids[50] is 1st, ids[1] is 50th, ids[0] 51st.
    const fiftieth = await locateTransaction(t.ctx, {}, ids[1]!);
    const fiftyFirst = await locateTransaction(t.ctx, {}, ids[0]!);

    expect([fiftieth.position, fiftieth.page]).toEqual([50, 1]);
    expect([fiftyFirst.position, fiftyFirst.page]).toEqual([51, 2]);
  });

  it('gives the page a non-matching Transaction would sit on', async () => {
    const category = await groceries();
    const ids = await seed(days(5));
    await editClassification(t.ctx, ids[2]!, { categoryId: category.id });

    // Unclassified at 2 per page: Oct 5, 4 | (Oct 3 would sit here) Oct 2, 1.
    const place = await locateTransaction(t.ctx, { unclassified: true, pageSize: 2 }, ids[2]!);

    expect(place).toMatchObject({ matches: false, total: 4, page: 2 });
  });

  it('rejects an unknown Transaction', async () => {
    await expect(
      locateTransaction(t.ctx, {}, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(locateTransaction(t.ctx, {}, 'not-an-id')).rejects.toBeInstanceOf(NotFoundError);
  });
});

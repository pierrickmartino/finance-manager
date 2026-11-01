import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { editClassification } from '../transactions/classification';
import { createTag, getTagActivity } from '.';

const t = setupTestDatabase();

async function account(currency: string) {
  const bank = await createBank(t.ctx, { name: `Bank ${currency}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: `Current ${currency}`,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

describe('getTagActivity', () => {
  it('sums money out and in per Currency, with the period and the top Categories', async () => {
    const chf = await account('CHF');
    const eur = await account('EUR');
    const [hotel, train, refund, untagged] = await seedTransactions(t.ctx.db, chf, [
      { bookingDate: '2025-07-02', amountMinor: -40_000 },
      { bookingDate: '2025-07-01', amountMinor: -8_000 },
      { bookingDate: '2025-07-20', amountMinor: 5_000 },
      { bookingDate: '2025-08-01', amountMinor: -999_999 },
    ]);
    const [dinner, lunch] = await seedTransactions(t.ctx.db, eur, [
      { bookingDate: '2025-07-10', amountMinor: -6_000 },
      { bookingDate: '2025-07-11', amountMinor: -2_500 },
    ]);
    const travel = await createCategoryGroup(t.ctx, { name: 'Travel', type: 'expense' });
    const lodging = await createCategory(t.ctx, { groupId: travel.id, name: 'Lodging' });
    const dining = await createCategory(t.ctx, { groupId: travel.id, name: 'Dining' });
    const vacation = await createTag(t.ctx, 'Vacation 2025');
    const tag = (categoryId?: string) => ({ tagIds: [vacation.id], categoryId });
    await editClassification(t.ctx, hotel!, tag(lodging.id));
    await editClassification(t.ctx, train!, tag());
    await editClassification(t.ctx, refund!, tag(lodging.id));
    await editClassification(t.ctx, dinner!, tag(dining.id));
    await editClassification(t.ctx, lunch!, tag(dining.id));
    await editClassification(t.ctx, untagged!, { categoryId: lodging.id });

    const activity = await getTagActivity(t.ctx, vacation.id);

    expect(activity).toEqual({
      totals: [
        { currency: 'CHF', outMinor: -48_000, inMinor: 5_000 },
        { currency: 'EUR', outMinor: -8_500, inMinor: 0 },
      ],
      firstDate: '2025-07-01',
      lastDate: '2025-07-20',
      topCategories: [
        { name: 'Dining', transactionCount: 2 },
        { name: 'Lodging', transactionCount: 2 },
      ],
    });
  });

  it('is empty for an unused Tag', async () => {
    const tag = await createTag(t.ctx, 'Unused');

    expect(await getTagActivity(t.ctx, tag.id)).toEqual({
      totals: [],
      firstDate: null,
      lastDate: null,
      topCategories: [],
    });
  });

  it('keeps the three most used Categories', async () => {
    const chf = await account('CHF');
    const ids = await seedTransactions(
      t.ctx.db,
      chf,
      Array.from({ length: 4 }, () => ({ bookingDate: '2025-07-01', amountMinor: -100 })),
    );
    const group = await createCategoryGroup(t.ctx, { name: 'Misc', type: 'expense' });
    const tag = await createTag(t.ctx, 'Many');
    for (const [index, id] of ids.entries()) {
      const category = await createCategory(t.ctx, { groupId: group.id, name: `C${index}` });
      await editClassification(t.ctx, id, { tagIds: [tag.id], categoryId: category.id });
    }

    expect((await getTagActivity(t.ctx, tag.id)).topCategories).toHaveLength(3);
  });

  it('rejects an unknown Tag', async () => {
    await expect(
      getTagActivity(t.ctx, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

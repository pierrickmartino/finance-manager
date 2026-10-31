import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { getBatchSummaries, listHistory } from '../history';
import { listTransactions } from '../transactions';
import { editClassification, getClassification } from '../transactions/classification';
import { createTag, deleteTag, listTags, mergeTags, renameTag } from '.';

const t = setupTestDatabase();

async function transactions(count: number): Promise<string[]> {
  const bank = await createBank(t.ctx, { name: 'UBS' });
  const account = await createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
  return seedTransactions(
    t.ctx.db,
    account,
    Array.from({ length: count }, (_, n) => ({
      bookingDate: '2025-10-01',
      amountMinor: -100 * (n + 1),
    })),
  );
}

const tagNames = async (id: string) =>
  (await getClassification(t.ctx, id)).tags.map((tag) => tag.name);

describe('Tags', () => {
  it('are created, renamed and listed with their counts', async () => {
    const [id] = await transactions(1);
    const tag = await createTag(t.ctx, 'Vacation 2024');
    await createTag(t.ctx, 'Baby');
    await editClassification(t.ctx, id!, { tagIds: [tag.id] });

    await renameTag(t.ctx, tag.id, 'Holidays 2024');

    expect(await listTags(t.ctx)).toMatchObject([
      { name: 'Baby', transactionCount: 0 },
      { name: 'Holidays 2024', transactionCount: 1 },
    ]);
    expect(await tagNames(id!)).toEqual(['Holidays 2024']);
    await expect(renameTag(t.ctx, tag.id, 'baby')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('a merge moves the Tag onto the target without duplicates, as one Batch', async () => {
    const [a, b] = await transactions(2);
    const source = await createTag(t.ctx, 'Vacances');
    const target = await createTag(t.ctx, 'Vacation');
    await editClassification(t.ctx, a!, { tagIds: [source.id] });
    await editClassification(t.ctx, b!, { tagIds: [source.id, target.id] });

    const result = await mergeTags(t.ctx, source.id, target.id);

    expect(result.transactionCount).toBe(2);
    expect(await tagNames(a!)).toEqual(['Vacation']);
    expect(await tagNames(b!)).toEqual(['Vacation']);
    expect(await listTags(t.ctx)).toMatchObject([{ name: 'Vacation', transactionCount: 2 }]);
    expect((await listTransactions(t.ctx, { tagId: target.id })).total).toBe(2);
    expect(await getBatchSummaries(t.ctx, [result.batchId])).toEqual({
      [result.batchId]: 'Merged Tag "Vacances" into "Vacation" (2 Transactions)',
    });
    expect(await listHistory(t.ctx, { batchId: result.batchId })).toHaveLength(3);
    await expect(mergeTags(t.ctx, target.id, target.id)).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('deleting a Tag removes it from its Transactions, as one Batch', async () => {
    const [a] = await transactions(1);
    const keep = await createTag(t.ctx, 'Keep');
    const drop = await createTag(t.ctx, 'Drop');
    await editClassification(t.ctx, a!, { tagIds: [keep.id, drop.id] });

    const result = await deleteTag(t.ctx, drop.id);

    expect(await tagNames(a!)).toEqual(['Keep']);
    expect(await listTags(t.ctx)).toMatchObject([{ name: 'Keep' }]);
    expect(
      (await listHistory(t.ctx, { batchId: result.batchId })).map((entry) => [
        entry.entityType,
        entry.field,
        entry.after,
      ]),
    ).toEqual([
      ['tag', 'name', null],
      ['transaction', 'tags', ['Keep']],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { getBatchSummaries, listHistory } from '../history';
import { listTransactions } from '../transactions';
import { editClassification, getClassification } from '../transactions/classification';
import { createPayee, deletePayee, listPayees, mergePayees, renamePayee } from '.';

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
      rawDescription: `shop ${n}`,
    })),
  );
}

describe('Payees', () => {
  it('are created and listed by name with their Transaction counts', async () => {
    const [id] = await transactions(1);
    await createPayee(t.ctx, 'Migros');
    const coop = await createPayee(t.ctx, ' Coop ');
    await editClassification(t.ctx, id!, { payeeId: coop.id });

    expect(await listPayees(t.ctx)).toMatchObject([
      { name: 'Coop', transactionCount: 1 },
      { name: 'Migros', transactionCount: 0 },
    ]);
    await expect(createPayee(t.ctx, 'MIGROS')).rejects.toMatchObject({ code: 'conflict' });
    await expect(createPayee(t.ctx, '')).rejects.toMatchObject({ code: 'validation' });
  });

  it('a rename is followed by every Transaction, with one History entry', async () => {
    const ids = await transactions(2);
    const payee = await createPayee(t.ctx, 'MIGROS GENEVE');
    for (const id of ids) await editClassification(t.ctx, id, { payeeId: payee.id });

    await renamePayee(t.ctx, payee.id, 'Migros');

    for (const id of ids) {
      expect((await getClassification(t.ctx, id)).payee?.name).toBe('Migros');
    }
    const [entry] = await listHistory(t.ctx);
    expect(entry).toMatchObject({
      entityType: 'payee',
      field: 'name',
      before: 'MIGROS GENEVE',
      after: 'Migros',
    });
    expect(await listHistory(t.ctx, { batchId: entry!.batchId })).toHaveLength(1);
  });

  it('a merge moves every Transaction to the target and deletes the source, as one Batch', async () => {
    const [a, b, c] = await transactions(3);
    const source = await createPayee(t.ctx, 'Coop Pronto');
    const target = await createPayee(t.ctx, 'Coop');
    await editClassification(t.ctx, a!, { payeeId: source.id });
    await editClassification(t.ctx, b!, { payeeId: source.id });
    await editClassification(t.ctx, c!, { payeeId: target.id });

    const result = await mergePayees(t.ctx, source.id, target.id);

    expect(result.transactionCount).toBe(2);
    expect(await listPayees(t.ctx)).toMatchObject([{ name: 'Coop', transactionCount: 3 }]);
    expect(
      (await listTransactions(t.ctx, { payeeId: target.id })).transactions.map((tx) => tx.id),
    ).toHaveLength(3);
    const batch = await listHistory(t.ctx, { batchId: result.batchId });
    expect(batch.map((entry) => [entry.entityType, entry.field, entry.after])).toEqual(
      expect.arrayContaining([
        ['transaction', 'payee', 'Coop'],
        ['payee', 'name', null],
      ]),
    );
    expect(batch).toHaveLength(3);
    expect(await getBatchSummaries(t.ctx, [result.batchId])).toEqual({
      [result.batchId]: 'Merged Payee "Coop Pronto" into "Coop" (2 Transactions)',
    });
    // Locks are kept: a merge is not a classification decision
    expect((await getClassification(t.ctx, a!)).lockedFields).toEqual(['payee']);
  });

  it('refuses to merge a Payee into itself', async () => {
    const payee = await createPayee(t.ctx, 'Coop');
    await expect(mergePayees(t.ctx, payee.id, payee.id)).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('deletes an unused Payee and refuses one still in use', async () => {
    const [id] = await transactions(1);
    const used = await createPayee(t.ctx, 'Used');
    const unused = await createPayee(t.ctx, 'Unused');
    await editClassification(t.ctx, id!, { payeeId: used.id });

    await deletePayee(t.ctx, unused.id);
    await expect(deletePayee(t.ctx, used.id)).rejects.toMatchObject({ code: 'conflict' });
    expect((await listPayees(t.ctx)).map((payee) => payee.name)).toEqual(['Used']);
  });
});

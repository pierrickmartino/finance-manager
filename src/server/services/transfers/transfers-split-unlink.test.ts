import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { deleteImportedTransaction, undoImport } from '../imports';
import { getClassification, getTransaction, listTransactions } from '../transactions';
import { bulkEditClassification } from '../transactions/bulk-edit';
import { deleteManualTransaction } from '../transactions/manual';
import { splitTransaction } from '../transactions/split';
import { getClassificationProgress, listUnclassifiedGroups } from '../transactions/unclassified';
import {
  getTransferCounterpart,
  linkTransfer,
  splitLineSide,
  transactionSide,
  unlinkTransfer,
} from '.';

/** Unlinking a Transfer held by a Split line (spec #56, ADR-0005). */

const t = setupTestDatabase();

async function account(name: string): Promise<Account> {
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

async function seedOne(on: Account, row: Partial<SeedTransaction> = {}): Promise<string> {
  const [id] = await seedTransactions(t.ctx.db, on, [
    { bookingDate: '2025-10-10', amountMinor: -150000, rawDescription: 'ORDRE E-BANKING', ...row },
  ]);
  return id!;
}

async function category(name: string) {
  const group = await createCategoryGroup(t.ctx, { name: `Group ${name}`, type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name });
}

/**
 * Spec #56's example, linked: a BCGE −1,500 split into −1,000 (linked with a UBS +1,000) and
 * −500 rent.
 */
async function linkedAggregatedDebit({ isManual = false } = {}) {
  const bcge = await account('BCGE');
  const ubs = await account('UBS');
  const debit = await seedOne(bcge, { amountMinor: -150000, isManual });
  const credit = await seedOne(ubs, { amountMinor: 100000, rawDescription: 'GUTSCHRIFT' });
  const savings = await category('Savings');
  const rent = await category('Rent');
  const split = await splitTransaction(t.ctx, debit, [
    { amountMinor: -100000, categoryId: savings.id },
    { amountMinor: -50000, categoryId: rent.id },
  ]);
  const [toSavings, toRent] = split.splitLines.map((line) => line.id) as [string, string];
  const transfer = await linkTransfer(t.ctx, {
    sides: [splitLineSide(toSavings), transactionSide(credit)],
  });
  return { bcge, ubs, debit, credit, toSavings, toRent, savings, rent, transfer };
}

async function lineOf(transactionId: string, lineId: string) {
  const { splitLines } = await getClassification(t.ctx, transactionId);
  return splitLines.find((line) => line.id === lineId)!;
}

describe('unlink a Transfer held by a Split line', () => {
  it('unlinks from the line: both sides lose the link, and the line has neither Category nor Transfer', async () => {
    const { debit, credit, toSavings } = await linkedAggregatedDebit();

    await unlinkTransfer(t.ctx, splitLineSide(toSavings));

    expect(await lineOf(debit, toSavings)).toMatchObject({ category: null, transferId: null });
    expect((await getTransaction(t.ctx, credit)).transferId).toBeNull();
    expect(await getTransferCounterpart(t.ctx, transactionSide(credit))).toBeNull();
  });

  it('unlinks from the whole Transaction on the other side', async () => {
    const { debit, credit, toSavings } = await linkedAggregatedDebit();

    await unlinkTransfer(t.ctx, transactionSide(credit));

    expect(await lineOf(debit, toSavings)).toMatchObject({ category: null, transferId: null });
    expect(await getTransferCounterpart(t.ctx, splitLineSide(toSavings))).toBeNull();
  });

  it('refuses a Split line that is not in a Transfer', async () => {
    const { toRent } = await linkedAggregatedDebit();

    await expect(unlinkTransfer(t.ctx, splitLineSide(toRent))).rejects.toMatchObject({
      code: 'validation',
      message: 'This Split line is not part of a Transfer',
    });
  });

  it('refuses a Split line that does not exist', async () => {
    await expect(
      unlinkTransfer(t.ctx, splitLineSide('00000000-0000-4000-8000-000000000000')),
    ).rejects.toMatchObject({ code: 'not_found', message: 'Split line not found' });
  });

  it("records the unlink in one Batch: the Transfer's sides and the line on its Transaction", async () => {
    const { debit, credit, toSavings, transfer } = await linkedAggregatedDebit();

    await unlinkTransfer(t.ctx, splitLineSide(toSavings));

    const [removed] = await listHistory(t.ctx, { entityType: 'transfer', entityId: transfer.id });
    expect(removed!.after).toBeNull();
    expect(removed!.before).toEqual(
      expect.arrayContaining([
        { kind: 'splitLine', id: toSavings },
        { kind: 'transaction', id: credit },
      ]),
    );
    const batch = await listHistory(t.ctx, { batchId: removed!.batchId });
    expect(batch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: credit, field: 'transferId', after: null }),
        expect.objectContaining({ entityId: debit, field: 'split' }),
      ]),
    );
    const split = batch.find((entry) => entry.entityId === debit)!;
    expect((split.before as object[])[0]).toMatchObject({ transferId: transfer.id });
    expect((split.after as object[])[0]).toMatchObject({ category: null });
    expect((split.after as object[])[0]).not.toHaveProperty('transferId');
  });
});

describe('deleting a side unlinks a Transfer held by a Split line', () => {
  it('deleting the split imported Transaction leaves the other side unlinked, without Category', async () => {
    const { debit, credit, transfer } = await linkedAggregatedDebit();

    await deleteImportedTransaction(t.ctx, debit);

    expect((await getTransaction(t.ctx, credit)).transferId).toBeNull();
    expect((await getClassification(t.ctx, credit)).category).toBeNull();
    const [removed] = await listHistory(t.ctx, { entityType: 'transfer', entityId: transfer.id });
    expect(removed!.after).toBeNull();
    const batch = await listHistory(t.ctx, { batchId: removed!.batchId });
    expect(batch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'transaction', entityId: debit, after: null }),
        expect.objectContaining({ entityId: credit, field: 'transferId', after: null }),
      ]),
    );
  });

  it('deleting the split Manual transaction leaves the other side unlinked', async () => {
    const { debit, credit } = await linkedAggregatedDebit({ isManual: true });

    await deleteManualTransaction(t.ctx, debit);

    expect((await getTransaction(t.ctx, credit)).transferId).toBeNull();
  });

  it("undoing the split Transaction's Import leaves the other side unlinked", async () => {
    const { debit, credit } = await linkedAggregatedDebit();
    const { importId } = await getTransaction(t.ctx, debit);

    await undoImport(t.ctx, importId!);

    expect((await getTransaction(t.ctx, credit)).transferId).toBeNull();
  });

  it('deleting the whole Transaction leaves the Split line with neither Category nor Transfer', async () => {
    const { debit, credit, toSavings } = await linkedAggregatedDebit();

    await deleteImportedTransaction(t.ctx, credit);

    expect(await lineOf(debit, toSavings)).toMatchObject({ category: null, transferId: null });
  });

  it('deleting one of two split Transactions linked by their lines leaves the other line unlinked', async () => {
    const { ubs, debit, toSavings, savings } = await linkedAggregatedDebit();
    await unlinkTransfer(t.ctx, splitLineSide(toSavings));
    const splitCredit = await seedOne(ubs, { amountMinor: 120000 });
    const credited = await splitTransaction(t.ctx, splitCredit, [
      { amountMinor: 100000, categoryId: savings.id },
      { amountMinor: 20000, categoryId: savings.id },
    ]);
    const fromChecking = credited.splitLines[0]!.id;
    await linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), splitLineSide(fromChecking)] });

    const { importId } = await getTransaction(t.ctx, splitCredit);
    await undoImport(t.ctx, importId!);

    expect(await lineOf(debit, toSavings)).toMatchObject({ category: null, transferId: null });
  });
});

/** Whether the Transaction is in the Unclassified view, and how many count as Unclassified. */
async function unclassifiedState(transactionId: string) {
  const { transactions: items } = await listTransactions(t.ctx, { unclassified: true });
  const { groups } = await listUnclassifiedGroups(t.ctx);
  const progress = await getClassificationProgress(t.ctx);
  return {
    listed: items.some((item) => item.id === transactionId),
    grouped: groups.some((group) => group.description === 'ORDRE E-BANKING'),
    unclassified: progress.unclassified,
  };
}

describe('a Transaction with an unlinked Split line is Unclassified', () => {
  it('is listed, grouped and counted as Unclassified once its line is unlinked', async () => {
    const { debit, toSavings } = await linkedAggregatedDebit();
    expect(await unclassifiedState(debit)).toEqual({
      listed: false,
      grouped: false,
      unclassified: 0,
    });

    await unlinkTransfer(t.ctx, splitLineSide(toSavings));

    // The other side, a whole Transaction left without a Category, is Unclassified too.
    expect(await unclassifiedState(debit)).toEqual({
      listed: true,
      grouped: true,
      unclassified: 2,
    });
  });

  it('is classified again once the line gets a Category back', async () => {
    const { debit, toSavings, toRent, savings, rent } = await linkedAggregatedDebit();
    await unlinkTransfer(t.ctx, splitLineSide(toSavings));

    await splitTransaction(t.ctx, debit, [
      { id: toSavings, amountMinor: -100000, categoryId: savings.id },
      { id: toRent, amountMinor: -50000, categoryId: rent.id },
    ]);

    expect((await unclassifiedState(debit)).listed).toBe(false);
  });

  it('is skipped by a Category bulk edit of its Unclassified group: only its lines hold Categories', async () => {
    const { bcge, debit, toSavings, rent } = await linkedAggregatedDebit();
    await unlinkTransfer(t.ctx, splitLineSide(toSavings));
    const plain = await seedOne(bcge, { amountMinor: -2000 });
    const [group] = (await listUnclassifiedGroups(t.ctx)).groups.filter(
      ({ description }) => description === 'ORDRE E-BANKING',
    );

    const result = await bulkEditClassification(t.ctx, {
      groupKey: group!.key,
      changes: { categoryId: rent.id },
    });

    expect(result.count).toBe(1);
    expect((await getClassification(t.ctx, plain)).category).toMatchObject({ id: rent.id });
    expect((await unclassifiedState(debit)).listed).toBe(true);
  });

  it('is classified again once the line is linked again', async () => {
    const { debit, credit, toSavings } = await linkedAggregatedDebit();
    await unlinkTransfer(t.ctx, splitLineSide(toSavings));

    await linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(credit)] });

    expect(await unclassifiedState(debit)).toEqual({
      listed: false,
      grouped: false,
      unclassified: 0,
    });
  });
});

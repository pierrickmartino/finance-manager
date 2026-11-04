import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { ValidationError } from '../errors';
import { createRule } from '../rules';
import { applyRulesToExisting } from '../rules/existing';
import { getTransferCounterpart, linkTransfer, splitLineSide, transactionSide } from '../transfers';
import { editClassification, getClassification } from '.';
import { unlockFields } from './classification';
import { removeSplit, splitTransaction } from './split';

/** Editing a Split that holds a Transfer line (ADR-0005). */

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
 * A BCGE −1,500 split into −1,000 (linked with a UBS +1,000 as a Transfer) and −500 rent.
 */
async function splitWithTransferLine() {
  const bcge = await account('BCGE');
  const ubs = await account('UBS');
  const debit = await seedOne(bcge, { amountMinor: -150000 });
  const credit = await seedOne(ubs, { amountMinor: 100000 });
  const savings = await category('Savings');
  const rent = await category('Rent');
  const groceries = await category('Groceries');
  const split = await splitTransaction(t.ctx, debit, [
    { amountMinor: -100000, categoryId: savings.id },
    { amountMinor: -50000, categoryId: rent.id },
  ]);
  const [linked, other] = split.splitLines.map((line) => line.id) as [string, string];
  const transfer = await linkTransfer(t.ctx, {
    sides: [splitLineSide(linked), transactionSide(credit)],
  });
  return { debit, credit, linked, other, transfer, rent, groceries };
}

describe('editing a Split that holds a Transfer line', () => {
  it("keeps the Transfer while the other lines are reclassified and the linked line's amount and note change", async () => {
    const { debit, credit, linked, other, transfer, groceries } = await splitWithTransferLine();

    const after = await splitTransaction(t.ctx, debit, [
      { id: linked, amountMinor: -90000, note: 'To savings' },
      { id: other, amountMinor: -40000, categoryId: groceries.id },
      { amountMinor: -20000, categoryId: groceries.id },
    ]);

    expect(after.splitLines).toEqual([
      expect.objectContaining({
        id: linked,
        amountMinor: -90000,
        note: 'To savings',
        category: null,
        transferId: transfer.id,
      }),
      expect.objectContaining({
        id: other,
        category: expect.objectContaining({ id: groceries.id }),
        transferId: null,
      }),
      expect.objectContaining({ amountMinor: -20000, transferId: null }),
    ]);
    expect(await getTransferCounterpart(t.ctx, splitLineSide(linked))).toMatchObject({
      kind: 'transaction',
      id: credit,
    });
    expect((await getClassification(t.ctx, debit)).splitLines[0]?.transferId).toBe(transfer.id);
  });
});

describe('dropping a Transfer line from a Split', () => {
  it('is refused with "unlink the Transfer first" and changes nothing', async () => {
    const { debit, other, transfer, rent } = await splitWithTransferLine();

    await expect(
      splitTransaction(t.ctx, debit, [
        { id: other, amountMinor: -100000, categoryId: rent.id },
        { amountMinor: -50000, categoryId: rent.id },
      ]),
    ).rejects.toThrow(/unlink the Transfer first/);

    const lines = (await getClassification(t.ctx, debit)).splitLines;
    expect(lines.map((line) => line.transferId)).toEqual([transfer.id, null]);
  });
});

describe('removing a Split that holds a Transfer line', () => {
  it('is refused with "unlink the Transfer first" and keeps the Split', async () => {
    const { debit, transfer } = await splitWithTransferLine();

    await expect(removeSplit(t.ctx, debit)).rejects.toThrow(/unlink the Transfer first/);

    const lines = (await getClassification(t.ctx, debit)).splitLines;
    expect(lines.map((line) => line.transferId)).toEqual([transfer.id, null]);
  });
});

describe('a Category on a Transfer line', () => {
  it('is refused through the Split editor', async () => {
    const { debit, linked, other, rent } = await splitWithTransferLine();

    await expect(
      splitTransaction(t.ctx, debit, [
        { id: linked, amountMinor: -100000, categoryId: rent.id },
        { id: other, amountMinor: -50000, categoryId: rent.id },
      ]),
    ).rejects.toThrow(/part of a Transfer: it can't have a Category/);

    expect((await getClassification(t.ctx, debit)).splitLines[0]?.category).toBeNull();
  });

  it('is refused through a Classification edit', async () => {
    const { debit, rent } = await splitWithTransferLine();

    await expect(editClassification(t.ctx, debit, { categoryId: rent.id })).rejects.toThrow(
      ValidationError,
    );

    expect((await getClassification(t.ctx, debit)).splitLines[0]?.category).toBeNull();
  });

  it('is never set by the Rules', async () => {
    const { debit, transfer, groceries } = await splitWithTransferLine();
    await unlockFields(t.ctx, debit, ['category']);
    await createRule(t.ctx, {
      name: 'Orders',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'ordre' }],
      actions: { categoryId: groceries.id },
    });

    await applyRulesToExisting(t.ctx, {});

    const [line] = (await getClassification(t.ctx, debit)).splitLines;
    expect(line).toMatchObject({ category: null, transferId: transfer.id });
  });
});

describe('a line without a Category that is not a Transfer side', () => {
  it('is still refused', async () => {
    const { debit, linked, other } = await splitWithTransferLine();

    await expect(
      splitTransaction(t.ctx, debit, [
        { id: linked, amountMinor: -100000 },
        { id: other, amountMinor: -50000 },
      ]),
    ).rejects.toThrow('Every Split line needs a Category');
  });
});

describe('splitting a whole Transaction that is a Transfer side', () => {
  it('stays refused', async () => {
    const { credit, rent } = await splitWithTransferLine();

    await expect(
      splitTransaction(t.ctx, credit, [
        { amountMinor: 60000, categoryId: rent.id },
        { amountMinor: 40000, categoryId: rent.id },
      ]),
    ).rejects.toThrow(/unlink the Transfer before splitting it/);
  });
});

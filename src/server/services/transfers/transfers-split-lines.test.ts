import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { editClassification, getClassification, getTransaction } from '../transactions';
import { splitTransaction } from '../transactions/split';
import {
  getTransferCounterpart,
  linkTransfer,
  listLinkOptions,
  splitLineSide,
  transactionSide,
} from '.';

/** Split lines as Transfer sides (ADR-0005): a line ↔ a whole Transaction. */

const t = setupTestDatabase();

async function account(name: string, currency = 'CHF'): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `Bank ${name}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency,
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
 * The example of spec #56: a BCGE −1,500 split into −1,000 (to savings) and −500 rent, and a
 * UBS +1,000. Returns the ids of both Transactions and of both Split lines.
 */
async function aggregatedDebit() {
  const bcge = await account('BCGE');
  const ubs = await account('UBS');
  const debit = await seedOne(bcge, { amountMinor: -150000 });
  const credit = await seedOne(ubs, { amountMinor: 100000 });
  const savings = await category('Savings');
  const rent = await category('Rent');
  const split = await splitTransaction(t.ctx, debit, [
    { amountMinor: -100000, categoryId: savings.id },
    { amountMinor: -50000, categoryId: rent.id },
  ]);
  const [toSavings, toRent] = split.splitLines.map((line) => line.id) as [string, string];
  return { bcge, ubs, debit, credit, toSavings, toRent, rent };
}

describe('link a Split line with a whole Transaction', () => {
  it('links the line, clears its Category and leaves the other lines alone', async () => {
    const { debit, credit, toSavings, toRent, rent } = await aggregatedDebit();

    const transfer = await linkTransfer(t.ctx, {
      sides: [splitLineSide(toSavings), transactionSide(credit)],
    });

    const lines = (await getClassification(t.ctx, debit)).splitLines;
    expect(lines).toEqual([
      expect.objectContaining({ id: toSavings, category: null, transferId: transfer.id }),
      expect.objectContaining({
        id: toRent,
        category: expect.objectContaining({ id: rent.id }),
        transferId: null,
      }),
    ]);
    expect((await getTransaction(t.ctx, credit)).transferId).toBe(transfer.id);
    expect((await getTransaction(t.ctx, debit)).transferId).toBeNull();
    expect(transfer.sides).toEqual(
      expect.arrayContaining([
        { kind: 'splitLine', id: toSavings },
        { kind: 'transaction', id: credit },
      ]),
    );
  });
});

describe('linking a Split line clears the Category of both sides', () => {
  it("clears the whole Transaction's Category too", async () => {
    const { credit, toSavings, rent } = await aggregatedDebit();
    await editClassification(t.ctx, credit, { categoryId: rent.id });

    await linkTransfer(t.ctx, { sides: [transactionSide(credit), splitLineSide(toSavings)] });

    expect((await getClassification(t.ctx, credit)).category).toBeNull();
  });
});

describe('the other side of a Split line Transfer', () => {
  it('names the whole Transaction from the line, and the line and its Transaction back', async () => {
    const { debit, credit, toSavings, toRent } = await aggregatedDebit();
    await linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(credit)] });

    expect(await getTransferCounterpart(t.ctx, splitLineSide(toSavings))).toMatchObject({
      kind: 'transaction',
      id: credit,
      amountMinor: 100000,
      transaction: { id: credit, accountName: 'UBS' },
    });
    expect(await getTransferCounterpart(t.ctx, transactionSide(credit))).toMatchObject({
      kind: 'splitLine',
      id: toSavings,
      amountMinor: -100000,
      transaction: { id: debit, accountName: 'BCGE', amountMinor: -150000 },
    });
    expect(await getTransferCounterpart(t.ctx, splitLineSide(toRent))).toBeNull();
  });
});

describe('link options of a Split line', () => {
  it("offers whole Transactions and Split lines that can be its other side, closest to the line's amount first", async () => {
    const { bcge, ubs, credit, toSavings } = await aggregatedDebit();
    const nearTotal = await seedOne(ubs, { amountMinor: 150000, bookingDate: '2025-10-11' });
    await seedOne(ubs, { amountMinor: -100000 }); // same sign
    await seedOne(bcge, { amountMinor: 100000 }); // same Account
    await seedOne(ubs, { amountMinor: 100000, bookingDate: '2025-12-31' }); // too far away
    const splitCredit = await seedOne(ubs, { amountMinor: 100000 });
    const rent = await category('Elsewhere');
    const { splitLines } = await splitTransaction(t.ctx, splitCredit, [
      { amountMinor: 60000, categoryId: rent.id },
      { amountMinor: 40000, categoryId: rent.id },
    ]); // split: only its lines can be sides
    const [big, small] = splitLines.map((line) => line.id) as [string, string];

    const options = await listLinkOptions(t.ctx, splitLineSide(toSavings));

    expect(options.map(({ kind, id }) => ({ kind, id }))).toEqual([
      transactionSide(credit), // +1,000
      splitLineSide(big), // +600
      transactionSide(nearTotal), // +1,500
      splitLineSide(small), // +400
    ]);
  });

  it('leaves out Transactions already in a Transfer', async () => {
    const { credit, toSavings, toRent } = await aggregatedDebit();
    await linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(credit)] });

    expect(await listLinkOptions(t.ctx, splitLineSide(toRent))).toEqual([]);
  });
});

describe('linking a Split line refuses a pair that is not a Transfer', () => {
  it('refuses the same line twice', async () => {
    const { toSavings } = await aggregatedDebit();

    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), splitLineSide(toSavings)] }),
    ).rejects.toThrow(/two different sides/);
  });

  it("refuses a whole Transaction on the line's Account", async () => {
    const { bcge, toSavings } = await aggregatedDebit();
    const sameAccount = await seedOne(bcge, { amountMinor: 100000 });

    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(sameAccount)] }),
    ).rejects.toThrow(/different Accounts/);
  });

  it('refuses a whole Transaction with the same sign as the line', async () => {
    const { ubs, toSavings } = await aggregatedDebit();
    const debit = await seedOne(ubs, { amountMinor: -100000 });

    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(debit)] }),
    ).rejects.toThrow(/opposite signs/);
  });

  it('refuses a line already in a Transfer, and a whole Transaction already in one', async () => {
    const { ubs, credit, toSavings, toRent } = await aggregatedDebit();
    await linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(credit)] });
    const another = await seedOne(ubs, { amountMinor: 100000, bookingDate: '2025-10-11' });

    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(toSavings), transactionSide(another)] }),
    ).rejects.toThrow('This Split line is already part of a Transfer');
    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(toRent), transactionSide(credit)] }),
    ).rejects.toThrow('This Transaction is already part of a Transfer');
  });

  it('refuses a split Transaction as a whole side, and leaves its lines as they were', async () => {
    const { debit, credit } = await aggregatedDebit();

    await expect(
      linkTransfer(t.ctx, { sides: [transactionSide(debit), transactionSide(credit)] }),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringMatching(/split/) });
    const lines = (await getClassification(t.ctx, debit)).splitLines;
    expect(lines.map((line) => line.transferId)).toEqual([null, null]);
    expect((await getTransaction(t.ctx, credit)).transferId).toBeNull();
  });

  it('refuses a Split line that does not exist', async () => {
    const { credit } = await aggregatedDebit();

    await expect(
      linkTransfer(t.ctx, {
        sides: [splitLineSide('00000000-0000-4000-8000-000000000000'), transactionSide(credit)],
      }),
    ).rejects.toMatchObject({ code: 'not_found', message: 'Split line not found' });
  });

  it('links a line and a whole Transaction in different Currencies, whatever the amounts', async () => {
    const { toSavings } = await aggregatedDebit();
    const eur = await account('CA', 'EUR');
    const credit = await seedOne(eur, { amountMinor: 1, bookingDate: '2025-10-30' });

    const transfer = await linkTransfer(t.ctx, {
      sides: [transactionSide(credit), splitLineSide(toSavings)],
    });

    expect((await getTransaction(t.ctx, credit)).transferId).toBe(transfer.id);
  });
});

describe('History of a Split line Transfer', () => {
  it("records the Transfer's sides with their kind, and the line on its Transaction, in one Batch", async () => {
    const { debit, credit, toSavings } = await aggregatedDebit();

    const transfer = await linkTransfer(t.ctx, {
      sides: [splitLineSide(toSavings), transactionSide(credit)],
    });

    const [created] = await listHistory(t.ctx, { entityType: 'transfer', entityId: transfer.id });
    expect(created!.after).toEqual(
      expect.arrayContaining([
        { kind: 'splitLine', id: toSavings },
        { kind: 'transaction', id: credit },
      ]),
    );
    const batch = await listHistory(t.ctx, { batchId: created!.batchId });
    expect(batch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: credit, field: 'transferId', after: transfer.id }),
        expect.objectContaining({ entityId: debit, field: 'split' }),
      ]),
    );
    const split = batch.find((entry) => entry.entityId === debit)!;
    expect((split.before as object[])[0]).toMatchObject({ category: 'Group Savings › Savings' });
    expect((split.after as object[])[0]).toMatchObject({ category: null, transferId: transfer.id });
    expect((split.after as object[])[1]).not.toHaveProperty('transferId');
  });
});

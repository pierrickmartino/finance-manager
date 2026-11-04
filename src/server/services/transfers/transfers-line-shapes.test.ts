import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { getClassification } from '../transactions';
import { splitTransaction } from '../transactions/split';
import { findImportTransferCandidates } from './candidates';
import {
  getTransferCounterpart,
  linkTransfer,
  listLinkOptions,
  splitLineSide,
  transactionSide,
} from '.';

/**
 * The rest of the shapes ADR-0005 allows: a Split line ↔ a Split line, several Transfer lines in
 * one Split, cross-currency lines, and the link picker offering both kinds of side.
 */

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

/** Splits a seeded Transaction into lines of these amounts; returns the line ids in order. */
async function split(transactionId: string, amounts: readonly number[]): Promise<string[]> {
  const other = await category(`Lines ${transactionId.slice(0, 8)}`);
  const result = await splitTransaction(
    t.ctx,
    transactionId,
    amounts.map((amountMinor) => ({ amountMinor, categoryId: other.id })),
  );
  return result.splitLines.map((line) => line.id);
}

describe('link a Split line with a Split line', () => {
  it('links two lines of Transactions on different Accounts, both ways', async () => {
    const bcge = await account('BCGE');
    const ubs = await account('UBS');
    const debit = await seedOne(bcge, { amountMinor: -150000 });
    const credit = await seedOne(ubs, { amountMinor: 120000 });
    const [toSavings, toRent] = await split(debit, [-100000, -50000]);
    const [fromBcge, salary] = await split(credit, [100000, 20000]);

    const transfer = await linkTransfer(t.ctx, {
      sides: [splitLineSide(toSavings!), splitLineSide(fromBcge!)],
    });

    expect(transfer.sides).toEqual(
      expect.arrayContaining([splitLineSide(toSavings!), splitLineSide(fromBcge!)]),
    );
    expect((await getClassification(t.ctx, debit)).splitLines).toEqual([
      expect.objectContaining({ id: toSavings, category: null, transferId: transfer.id }),
      expect.objectContaining({ id: toRent, transferId: null }),
    ]);
    expect((await getClassification(t.ctx, credit)).splitLines).toEqual([
      expect.objectContaining({ id: fromBcge, category: null, transferId: transfer.id }),
      expect.objectContaining({ id: salary, transferId: null }),
    ]);
    expect(await getTransferCounterpart(t.ctx, splitLineSide(toSavings!))).toMatchObject({
      kind: 'splitLine',
      id: fromBcge,
      amountMinor: 100000,
      transaction: { id: credit, accountName: 'UBS' },
    });
    expect(await getTransferCounterpart(t.ctx, splitLineSide(fromBcge!))).toMatchObject({
      kind: 'splitLine',
      id: toSavings,
      amountMinor: -100000,
      transaction: { id: debit, accountName: 'BCGE' },
    });
  });

  it('refuses two lines on the same Account, or with the same sign', async () => {
    const bcge = await account('BCGE');
    const ubs = await account('UBS');
    const [out] = await split(await seedOne(bcge, { amountMinor: -150000 }), [-100000, -50000]);
    const [sameAccount] = await split(
      await seedOne(bcge, { amountMinor: 150000 }),
      [100000, 50000],
    );
    const [sameSign] = await split(await seedOne(ubs, { amountMinor: -150000 }), [-100000, -50000]);

    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(out!), splitLineSide(sameAccount!)] }),
    ).rejects.toThrow(/different Accounts/);
    await expect(
      linkTransfer(t.ctx, { sides: [splitLineSide(out!), splitLineSide(sameSign!)] }),
    ).rejects.toThrow(/opposite signs/);
  });
});

describe('several Transfer lines in one Split', () => {
  it('lets each line of one Split be a side of its own Transfer', async () => {
    const bcge = await account('BCGE');
    const savings = await account('Savings');
    const pillar = await account('3a');
    const debit = await seedOne(bcge, { amountMinor: -150000 });
    const [toSavings, toPillar, rent] = await split(debit, [-80000, -50000, -20000]);
    const intoSavings = await seedOne(savings, { amountMinor: 80000 });
    const intoPillar = await seedOne(pillar, { amountMinor: 50000 });

    const first = await linkTransfer(t.ctx, {
      sides: [splitLineSide(toSavings!), transactionSide(intoSavings)],
    });
    const second = await linkTransfer(t.ctx, {
      sides: [splitLineSide(toPillar!), transactionSide(intoPillar)],
    });

    expect(first.id).not.toBe(second.id);
    expect((await getClassification(t.ctx, debit)).splitLines).toEqual([
      expect.objectContaining({ id: toSavings, transferId: first.id }),
      expect.objectContaining({ id: toPillar, transferId: second.id }),
      expect.objectContaining({ id: rent, transferId: null, category: expect.anything() }),
    ]);
    expect(await getTransferCounterpart(t.ctx, splitLineSide(toPillar!))).toMatchObject({
      kind: 'transaction',
      id: intoPillar,
    });
  });
});

const optionRefs = (options: readonly { kind: string; id: string }[]) =>
  options.map(({ kind, id }) => ({ kind, id }));

describe('the link picker offers whole Transactions and Split lines', () => {
  /**
   * A UBS +1,000 to link, and on BCGE: a −1,000 Transaction, a split −1,500 whose −1,000 and
   * −500 lines are options, and lines that are not (same sign, linked, too far, same Account).
   */
  async function picker() {
    const ubs = await account('UBS');
    const bcge = await account('BCGE');
    const savings = await account('Savings');
    const credit = await seedOne(ubs, { amountMinor: 100000 });
    const whole = await seedOne(bcge, { amountMinor: -100000, bookingDate: '2025-10-14' });
    const [exact, rest] = await split(
      await seedOne(bcge, { amountMinor: -150000 }),
      [-100000, -50000],
    );
    // A mixed Split: its −100 line is an option, its +300 line has the same sign.
    const [mixedOut] = await split(await seedOne(bcge, { amountMinor: 20000 }), [-10000, 30000]);
    // A Split with a linked line: only its other −300 line is an option.
    const [linked, beside] = await split(
      await seedOne(bcge, { amountMinor: -90000 }),
      [-60000, -30000],
    );
    const intoSavings = await seedOne(savings, { amountMinor: 60000 });
    await linkTransfer(t.ctx, {
      sides: [splitLineSide(linked!), transactionSide(intoSavings)],
    });
    await split(
      await seedOne(bcge, { amountMinor: -100000, bookingDate: '2025-12-31' }),
      [-60000, -40000],
    ); // too far away
    await split(await seedOne(ubs, { amountMinor: -100000 }), [-60000, -40000]); // same Account
    return {
      ubs,
      credit,
      whole,
      exact: exact!,
      rest: rest!,
      beside: beside!,
      mixedOut: mixedOut!,
    };
  }

  it('from a whole Transaction: eligible whole Transactions and Split lines, closest amount then date', async () => {
    const { credit, whole, exact, rest, beside, mixedOut } = await picker();

    const options = await listLinkOptions(t.ctx, transactionSide(credit));

    expect(optionRefs(options)).toEqual([
      splitLineSide(exact), // −1,000, same day
      transactionSide(whole), // −1,000, four days later
      splitLineSide(rest), // −500
      splitLineSide(beside), // −300
      splitLineSide(mixedOut), // −100
    ]);
    expect(options[0]).toMatchObject({
      amountMinor: -100000,
      transaction: { amountMinor: -150000, accountName: 'BCGE' },
    });
  });

  it('from a Split line: eligible whole Transactions and lines of other Transactions', async () => {
    const { ubs, credit, exact } = await picker();
    const [inLine, salary] = await split(
      await seedOne(ubs, { amountMinor: 120000, bookingDate: '2025-10-12' }),
      [100000, 20000],
    );

    const options = await listLinkOptions(t.ctx, splitLineSide(exact));

    // Not the BCGE mixed Split's +300 line, nor the line's own sibling: same Account.
    expect(optionRefs(options)).toEqual([
      transactionSide(credit), // +1,000, same day
      splitLineSide(inLine!), // +1,000, two days later
      splitLineSide(salary!), // +200
    ]);
  });
});

describe('Transfer candidates at Import', () => {
  it('are never a split Transaction or one of its Split lines', async () => {
    const bcge = await account('BCGE');
    const ubs = await account('UBS');
    const debit = await seedOne(bcge, { amountMinor: -100000 });
    await split(debit, [-60000, -40000]);
    const db = t.ctx.db;
    const entry = {
      bookingDate: '2025-10-10',
      currency: 'CHF',
      counterpartyIban: null,
      skip: false,
    };

    const [byTotal, byLine] = await findImportTransferCandidates(db, ubs.id, [
      { ...entry, amountMinor: 100000 },
      { ...entry, amountMinor: 60000 },
    ]);

    expect(byTotal).toEqual([]);
    expect(byLine).toEqual([]);
  });
});

describe('cross-currency Split line Transfers', () => {
  it('links a CHF line with a EUR line, whatever the amounts', async () => {
    const chf = await account('BCGE');
    const eur = await account('CA', 'EUR');
    const [out] = await split(await seedOne(chf, { amountMinor: -150000 }), [-100000, -50000]);
    const [into] = await split(await seedOne(eur, { amountMinor: 120000 }), [104321, 15679]);

    await linkTransfer(t.ctx, { sides: [splitLineSide(out!), splitLineSide(into!)] });

    expect(await getTransferCounterpart(t.ctx, splitLineSide(out!))).toMatchObject({
      kind: 'splitLine',
      id: into,
      amountMinor: 104321,
      transaction: { accountName: 'CA', currency: 'EUR' },
    });
  });
});

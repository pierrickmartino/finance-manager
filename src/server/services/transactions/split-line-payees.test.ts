import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { createPayee, listPayees } from '../payees';
import { createRule } from '../rules';
import { applyRulesToExisting } from '../rules/existing';
import { createTag } from '../tags';
import { linkTransfer, splitLineSide, transactionSide } from '../transfers';
import { editClassification, getTransaction } from '.';
import { bulkEditClassification } from './bulk-edit';
import { unlockFields } from './classification';
import { removeSplit, splitTransaction } from './split';

/** A Payee on a Split line (ADR-0006). */

const t = setupTestDatabase();

const UNKNOWN = '00000000-0000-4000-8000-000000000000';

async function account(name = 'BCGE'): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `Bank ${name} ${Math.random()}` });
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

async function transaction(amountMinor = -10000, on?: Account): Promise<string> {
  const [id] = await seedTransactions(t.ctx.db, on ?? (await account()), [
    { bookingDate: '2025-10-03', amountMinor, rawDescription: 'ORDRE GROUPE' },
  ]);
  return id!;
}

async function category(name: string) {
  const group = await createCategoryGroup(t.ctx, { name: `Group ${name}`, type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name });
}

describe('a Payee on a Split line', () => {
  it("stores each line's own Payee, and reports a blank line under its Transaction's Payee", async () => {
    const id = await transaction(-10000);
    const groceries = await category('Groceries');
    const coop = await createPayee(t.ctx, 'Coop');
    await editClassification(t.ctx, id, { payeeName: 'Migros' });

    await splitTransaction(t.ctx, id, [
      { amountMinor: -7000, categoryId: groceries.id, payeeId: coop.id },
      { amountMinor: -3000, categoryId: groceries.id },
    ]);

    expect((await getTransaction(t.ctx, id)).splitLines).toMatchObject([
      { payee: { id: coop.id, name: 'Coop' }, reportedPayee: { id: coop.id, name: 'Coop' } },
      { payee: null, reportedPayee: { name: 'Migros' } },
    ]);
  });

  it('refuses an unknown Payee on a line as a validation error, and changes nothing', async () => {
    const id = await transaction(-10000);
    const groceries = await category('Groceries');

    await expect(
      splitTransaction(t.ctx, id, [
        { amountMinor: -7000, categoryId: groceries.id, payeeId: UNKNOWN },
        { amountMinor: -3000, categoryId: groceries.id },
      ]),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringContaining('Payee') });
    expect((await getTransaction(t.ctx, id)).splitLines).toEqual([]);
  });
});

describe("a blank line follows its Transaction's Payee; a picked one stays pinned", () => {
  /** A split −100 with a line pinned to Migros (the Transaction's own Payee) and a blank one. */
  async function pinnedAndBlank() {
    const id = await transaction(-10000);
    const groceries = await category('Groceries');
    const migros = await createPayee(t.ctx, 'Migros');
    await editClassification(t.ctx, id, { payeeId: migros.id });
    await splitTransaction(t.ctx, id, [
      { amountMinor: -7000, categoryId: groceries.id, payeeId: migros.id },
      { amountMinor: -3000, categoryId: groceries.id },
    ]);
    return id;
  }

  const reported = async (id: string) =>
    (await getTransaction(t.ctx, id)).splitLines.map((line) => line.reportedPayee?.name ?? null);
  const own = async (id: string) =>
    (await getTransaction(t.ctx, id)).splitLines.map((line) => line.payee?.name ?? null);

  it('after a manual edit of the Transaction', async () => {
    const id = await pinnedAndBlank();

    await editClassification(t.ctx, id, { payeeName: 'Coop' });

    expect((await getTransaction(t.ctx, id)).payee?.name).toBe('Coop');
    expect(await reported(id)).toEqual(['Migros', 'Coop']);
  });

  it('after a bulk edit', async () => {
    const id = await pinnedAndBlank();

    await bulkEditClassification(t.ctx, { transactionIds: [id], changes: { payeeName: 'Coop' } });

    expect(await reported(id)).toEqual(['Migros', 'Coop']);
  });

  it("after a Rule sets the Transaction's Payee, which never sets a line's", async () => {
    const id = await pinnedAndBlank();
    await unlockFields(t.ctx, id, ['payee']);
    const coop = await createPayee(t.ctx, 'Coop');
    await createRule(t.ctx, {
      name: 'Ordres',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'ORDRE' }],
      actions: { payeeId: coop.id, categoryId: null, tagIds: [] },
    });

    await applyRulesToExisting(t.ctx, {});

    expect(await reported(id)).toEqual(['Migros', 'Coop']);
    expect(await own(id)).toEqual(['Migros', null]);
  });

  it("matches a Rule's Payee condition against the Transaction's own Payee only", async () => {
    const id = await pinnedAndBlank();
    const coop = await createPayee(t.ctx, 'Coop');
    const groceries = await category('Food');
    const [first, second] = (await getTransaction(t.ctx, id)).splitLines;
    await splitTransaction(t.ctx, id, [
      { id: first!.id, amountMinor: -7000, categoryId: groceries.id, payeeId: coop.id },
      { id: second!.id, amountMinor: -3000, categoryId: groceries.id },
    ]);
    const lineTag = await createTag(t.ctx, 'Line payee');
    const ownTag = await createTag(t.ctx, 'Own payee');
    const payeeIs = (value: string) =>
      [{ type: 'text', field: 'payee', operator: 'equals', value }] as const;
    await createRule(t.ctx, {
      name: 'Coop',
      conditions: [...payeeIs('Coop')],
      actions: { payeeId: null, categoryId: null, tagIds: [lineTag.id] },
    });
    await createRule(t.ctx, {
      name: 'Migros',
      conditions: [...payeeIs('Migros')],
      actions: { payeeId: null, categoryId: null, tagIds: [ownTag.id] },
    });

    await applyRulesToExisting(t.ctx, {});

    expect((await getTransaction(t.ctx, id)).tags.map((tag) => tag.name)).toEqual(['Own payee']);
  });
});

describe('a Transfer Split line has no Payee', () => {
  /** A BCGE −1,500 split into −1,000 to savings (Payee Coop) and −500 rent, and a UBS +1,000. */
  async function splitWithPayeeLine() {
    const debit = await transaction(-150000, await account('BCGE'));
    const [credit] = await seedTransactions(t.ctx.db, await account('UBS'), [
      { bookingDate: '2025-10-03', amountMinor: 100000, rawDescription: 'VIREMENT' },
    ]);
    const savings = await category('Savings');
    const rent = await category('Rent');
    const coop = await createPayee(t.ctx, 'Coop');
    const split = await splitTransaction(t.ctx, debit, [
      { amountMinor: -100000, categoryId: savings.id, payeeId: coop.id },
      { amountMinor: -50000, categoryId: rent.id },
    ]);
    const [line, other] = split.splitLines.map((l) => l.id) as [string, string];
    return { debit, credit: credit!, line, other, rent, coop };
  }

  it('linking a line to a Transfer clears its Payee', async () => {
    const { debit, credit, line } = await splitWithPayeeLine();

    await linkTransfer(t.ctx, { sides: [splitLineSide(line), transactionSide(credit)] });

    expect((await getTransaction(t.ctx, debit)).splitLines[0]).toMatchObject({
      id: line,
      category: null,
      payee: null,
    });
  });

  it('refuses a Payee on a Transfer line', async () => {
    const { debit, credit, line, other, rent, coop } = await splitWithPayeeLine();
    await linkTransfer(t.ctx, { sides: [splitLineSide(line), transactionSide(credit)] });

    await expect(
      splitTransaction(t.ctx, debit, [
        { id: line, amountMinor: -100000, payeeId: coop.id },
        { id: other, amountMinor: -50000, categoryId: rent.id },
      ]),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringContaining('Payee') });
  });

  it('the database refuses a Transfer line with a Payee', async () => {
    const { credit, line, coop } = await splitWithPayeeLine();
    await linkTransfer(t.ctx, { sides: [splitLineSide(line), transactionSide(credit)] });

    await expect(
      t.ctx.db.query('UPDATE split_line SET payee_id = $1 WHERE id = $2', [coop.id, line]),
    ).rejects.toMatchObject({ constraint: 'split_line_transfer_has_no_payee' });
  });
});

describe('removing a Split', () => {
  it("discards its lines' Payees and keeps the Transaction's", async () => {
    const id = await transaction(-10000);
    const groceries = await category('Groceries');
    const coop = await createPayee(t.ctx, 'Coop');
    await editClassification(t.ctx, id, { payeeName: 'Migros' });
    await splitTransaction(t.ctx, id, [
      { amountMinor: -7000, categoryId: groceries.id, payeeId: coop.id },
      { amountMinor: -3000, categoryId: groceries.id },
    ]);

    await removeSplit(t.ctx, id);

    expect(await getTransaction(t.ctx, id)).toMatchObject({
      payee: { name: 'Migros' },
      splitLines: [],
    });
    expect(await listPayees(t.ctx)).toContainEqual(
      expect.objectContaining({ name: 'Coop', transactionCount: 0 }),
    );
  });
});

describe("a line's Payee in History", () => {
  it("records setting, changing and clearing it in the Split's Batch", async () => {
    const id = await transaction(-10000);
    const groceries = await category('Groceries');
    const coop = await createPayee(t.ctx, 'Coop');
    const denner = await createPayee(t.ctx, 'Denner');
    const splitWith = async (payeeId: string | null) => {
      const split = await getTransaction(t.ctx, id);
      const [first, second] = split.splitLines;
      await splitTransaction(t.ctx, id, [
        { id: first?.id, amountMinor: -7000, categoryId: groceries.id, payeeId },
        { id: second?.id, amountMinor: -3000, categoryId: groceries.id },
      ]);
      const [latest] = await listHistory(t.ctx, { entityId: id });
      const batch = await listHistory(t.ctx, { batchId: latest!.batchId });
      return batch.find((entry) => entry.field === 'split');
    };

    await splitWith(null);
    const set = await splitWith(coop.id);
    const changed = await splitWith(denner.id);
    const cleared = await splitWith(null);

    expect(set).toMatchObject({
      actorType: 'manual',
      before: [expect.not.objectContaining({ payee: expect.anything() }), expect.anything()],
      after: [expect.objectContaining({ payee: 'Coop' }), expect.anything()],
    });
    expect(changed).toMatchObject({
      before: [expect.objectContaining({ payee: 'Coop' }), expect.anything()],
      after: [expect.objectContaining({ payee: 'Denner' }), expect.anything()],
    });
    expect(cleared).toMatchObject({
      before: [expect.objectContaining({ payee: 'Denner' }), expect.anything()],
      after: [expect.not.objectContaining({ payee: expect.anything() }), expect.anything()],
    });
  });
});
